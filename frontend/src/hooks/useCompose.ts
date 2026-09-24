/**
 * The composer page's state.
 *
 * It owns its own job on the server, separate from the batch editor, so the
 * two never interfere. Two canvas modes share one element list:
 *
 *   image  the canvas IS the uploaded photo, at its own pixel size
 *   card   the canvas is a page, and the photo is just another element
 */
import { useCallback, useMemo, useRef, useState } from 'react'

import { api, ApiError } from '@/services/api'
import type {
  CanvasAsset,
  CanvasSettings,
  CardPreset,
  ComposeResult,
  OverlayElement,
} from '@/types/editor'
import { DEFAULT_CANVAS } from '@/types/editor'
import { type CatalogMargins, computeCatalogLayout } from '@/utils/catalogLayout'
import { clampElement, createElement, elementsPayload, ELEMENT_LIMIT } from '@/utils/overlays'
import { clamp, type Size } from '@/utils/transforms'

export const CARD_PRESETS: Record<Exclude<CardPreset, 'custom'>, Size & { label: string }> = {
  'a4-150': { width: 1240, height: 1754, label: 'A4 page · 150 dpi' },
  'a4-300': { width: 2480, height: 3508, label: 'A4 page · 300 dpi' },
  'square-1080': { width: 1080, height: 1080, label: 'Square · 1080' },
  'square-2048': { width: 2048, height: 2048, label: 'Square · 2048' },
  'portrait-1080': { width: 1080, height: 1350, label: 'Portrait 4:5' },
  'story-1080': { width: 1080, height: 1920, label: 'Story 9:16' },
  catalog: { width: 925, height: 1131, label: 'Catalog card' },
}

const HISTORY_LIMIT = 60

export interface UseCompose {
  jobId: string | null
  baseImage: CanvasAsset | null
  assets: CanvasAsset[]
  assetMap: Record<string, CanvasAsset>
  canvas: CanvasSettings
  frame: Size
  elements: OverlayElement[]
  selectedId: string | null
  selected: OverlayElement | null
  isUploading: boolean
  isExporting: boolean
  result: ComposeResult | null
  viewZoom: number
  canUndo: boolean
  canRedo: boolean

  uploadBase: (file: File) => Promise<void>
  uploadAsset: (file: File, asElement?: boolean) => Promise<void>
  removeAsset: (assetId: string) => Promise<void>
  setCanvas: (patch: Partial<CanvasSettings>) => void
  setMode: (mode: CanvasSettings['mode']) => void
  addText: (overrides?: Partial<OverlayElement>) => void
  addImageElement: (assetId: string) => void
  /** Uploads the product photo as a plain asset - no element yet. */
  uploadCatalogImage: (file: File) => Promise<CanvasAsset | null>
  /** Auto-layout: switches to the catalog card and creates the text box +
   * image element in one step (one undo entry for the whole slide). */
  createCatalogSlide: (
    text: string,
    assetId: string,
    margins?: CatalogMargins,
  ) => { fontSizeReduced: boolean } | null
  select: (id: string | null) => void
  update: (id: string, patch: Partial<OverlayElement>, commit?: boolean) => void
  remove: (id: string) => void
  duplicate: (id: string) => void
  moveLayer: (id: string, direction: -1 | 1) => void
  setViewZoom: (zoom: number) => void
  undo: () => void
  redo: () => void
  commit: () => void
  exportCanvas: () => Promise<void>
  reset: () => Promise<void>
}

export function useCompose(onError: (message: string) => void): UseCompose {
  const [jobId, setJobId] = useState<string | null>(null)
  const [baseImage, setBaseImage] = useState<CanvasAsset | null>(null)
  const [assets, setAssets] = useState<CanvasAsset[]>([])
  const [canvas, setCanvasState] = useState<CanvasSettings>(DEFAULT_CANVAS)
  const [elements, setElements] = useState<OverlayElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isUploading, setUploading] = useState(false)
  const [isExporting, setExporting] = useState(false)
  const [result, setResult] = useState<ComposeResult | null>(null)
  const [viewZoom, setViewZoomState] = useState(1)

  const [past, setPast] = useState<OverlayElement[][]>([])
  const [future, setFuture] = useState<OverlayElement[][]>([])
  const pending = useRef<OverlayElement[] | null>(null)
  const objectUrls = useRef<Set<string>>(new Set())

  const fail = useCallback(
    (cause: unknown, fallback: string) => {
      onError(cause instanceof ApiError ? cause.message : fallback)
    },
    [onError],
  )

  const pushHistory = useCallback((before: OverlayElement[]) => {
    setPast((current) => [...current, before].slice(-HISTORY_LIMIT))
    setFuture([])
  }, [])

  const mutate = useCallback(
    (mutateFn: (list: OverlayElement[]) => OverlayElement[], commit = true) => {
      setElements((current) => {
        if (commit) pushHistory(current)
        else if (!pending.current) pending.current = current
        return mutateFn(current)
      })
      setResult(null)
    },
    [pushHistory],
  )

  const commit = useCallback(() => {
    const before = pending.current
    pending.current = null
    if (before) pushHistory(before)
  }, [pushHistory])

  // --- uploads ------------------------------------------------------------

  const ensureJob = useCallback(
    async (file: File) => {
      if (jobId) {
        const response = await api.addImages(jobId, [file])
        return { jobId, record: (response.added ?? response.images)[0] }
      }
      const response = await api.createJob([file])
      return { jobId: response.jobId, record: response.images[0] }
    },
    [jobId],
  )

  const upload = useCallback(
    async (file: File): Promise<CanvasAsset | null> => {
      setUploading(true)
      try {
        const { jobId: id, record } = await ensureJob(file)
        if (!record) return null
        const previewUrl = URL.createObjectURL(file)
        objectUrls.current.add(previewUrl)
        const asset: CanvasAsset = {
          id: record.id,
          name: record.name,
          width: record.width,
          height: record.height,
          size: record.size,
          format: record.format,
          previewUrl,
        }
        setJobId(id)
        setAssets((current) => [...current, asset])
        return asset
      } catch (cause) {
        fail(cause, 'That file could not be uploaded.')
        return null
      } finally {
        setUploading(false)
      }
    },
    [ensureJob, fail],
  )

  /** Width (as a % of the canvas) that fits an asset inside the card. */
  const fitWidthPercent = useCallback(
    (asset: CanvasAsset, target: Size) => {
      const ratio = asset.height / Math.max(1, asset.width)
      const byHeight = (0.8 * target.height) / (target.width * ratio)
      return clamp(Math.min(0.8, byHeight) * 100, 2, 200)
    },
    [],
  )

  const frame = useMemo<Size>(() => {
    if (canvas.mode === 'image' && baseImage) {
      return { width: baseImage.width, height: baseImage.height }
    }
    if (canvas.preset === 'custom') {
      return { width: canvas.width, height: canvas.height }
    }
    return CARD_PRESETS[canvas.preset]
  }, [baseImage, canvas])

  const uploadBase = useCallback(
    async (file: File) => {
      const asset = await upload(file)
      if (!asset) return
      setBaseImage(asset)
      setResult(null)
      if (canvas.mode === 'card') {
        const target =
          canvas.preset === 'custom'
            ? { width: canvas.width, height: canvas.height }
            : CARD_PRESETS[canvas.preset]
        mutate((current) => [
          createElement({
            type: 'image',
            assetId: asset.id,
            x: 50,
            y: 45,
            widthPercent: fitWidthPercent(asset, target),
          }),
          ...current,
        ])
      }
    },
    [canvas, fitWidthPercent, mutate, upload],
  )

  const addImageElement = useCallback(
    (assetId: string) => {
      const asset = assets.find((item) => item.id === assetId)
      if (!asset) return
      const element = createElement({
        type: 'image',
        assetId,
        x: 50,
        y: 50,
        widthPercent: Math.min(30, fitWidthPercent(asset, frame)),
      })
      mutate((current) => (current.length >= ELEMENT_LIMIT ? current : [...current, element]))
      setSelectedId(element.id)
    },
    [assets, fitWidthPercent, frame, mutate],
  )

  const uploadAsset = useCallback(
    async (file: File, asElement = true) => {
      const asset = await upload(file)
      if (!asset || !asElement) return
      const element = createElement({
        type: 'image',
        assetId: asset.id,
        x: 50,
        y: 50,
        widthPercent: Math.min(30, fitWidthPercent(asset, frame)),
      })
      mutate((current) => (current.length >= ELEMENT_LIMIT ? current : [...current, element]))
      setSelectedId(element.id)
    },
    [fitWidthPercent, frame, mutate, upload],
  )

  const uploadCatalogImage = useCallback(
    (file: File) => upload(file),
    [upload],
  )

  const createCatalogSlide = useCallback(
    (text: string, assetId: string, margins?: CatalogMargins) => {
      const asset = assets.find((item) => item.id === assetId)
      const target = CARD_PRESETS.catalog
      const layout = computeCatalogLayout({ frame: target, text, asset, margins })

      // One element per recognised section (title/description/details/price)
      // - each is an ordinary text-box element, independently selectable,
      // draggable, resizable and stylable through the existing Inspector.
      const textElements = layout.sections.map((section) =>
        createElement({ type: 'text', text: section.text, ...section.element }),
      )
      const imageElement = layout.image
        ? createElement({ type: 'image', assetId, ...layout.image })
        : null

      setCanvasState((current) => ({
        ...current,
        mode: 'card',
        preset: 'catalog',
        width: target.width,
        height: target.height,
      }))
      mutate((current) => [...current, ...textElements, ...(imageElement ? [imageElement] : [])])
      // Select the title (first section) so its controls show right away.
      setSelectedId(textElements[0]?.id ?? imageElement?.id ?? null)
      return { fontSizeReduced: layout.fontSizeReduced }
    },
    [assets, mutate],
  )

  const removeAsset = useCallback(
    async (assetId: string) => {
      if (!jobId) return
      try {
        await api.removeImage(jobId, assetId)
      } catch (cause) {
        fail(cause, 'That file could not be removed.')
        return
      }
      const asset = assets.find((item) => item.id === assetId)
      if (asset) {
        URL.revokeObjectURL(asset.previewUrl)
        objectUrls.current.delete(asset.previewUrl)
      }
      setAssets((current) => current.filter((item) => item.id !== assetId))
      mutate((current) => current.filter((element) => element.assetId !== assetId))
      setBaseImage((current) => (current?.id === assetId ? null : current))
    },
    [assets, fail, jobId, mutate],
  )

  // --- canvas -------------------------------------------------------------

  const setCanvas = useCallback((patch: Partial<CanvasSettings>) => {
    setCanvasState((current) => {
      const next = { ...current, ...patch }
      if (patch.preset && patch.preset !== 'custom') {
        const preset = CARD_PRESETS[patch.preset]
        next.width = preset.width
        next.height = preset.height
      }
      return next
    })
    setResult(null)
  }, [])

  const setMode = useCallback(
    (mode: CanvasSettings['mode']) => {
      setCanvasState((current) => ({ ...current, mode }))
      setResult(null)
      if (mode !== 'card' || !baseImage) return
      // Moving to a card: the photo becomes an element so it can be placed.
      setElements((current) => {
        if (current.some((element) => element.assetId === baseImage.id)) return current
        pushHistory(current)
        const target =
          canvas.preset === 'custom'
            ? { width: canvas.width, height: canvas.height }
            : CARD_PRESETS[canvas.preset]
        return [
          createElement({
            type: 'image',
            assetId: baseImage.id,
            x: 50,
            y: 45,
            widthPercent: fitWidthPercent(baseImage, target),
          }),
          ...current,
        ]
      })
    },
    [baseImage, canvas, fitWidthPercent, pushHistory],
  )

  // --- elements -----------------------------------------------------------

  const addText = useCallback(
    (overrides: Partial<OverlayElement> = {}) => {
      const element = createElement({ text: 'Your text', fontSize: 44, ...overrides })
      mutate((current) => (current.length >= ELEMENT_LIMIT ? current : [...current, element]))
      setSelectedId(element.id)
    },
    [mutate],
  )

  const update = useCallback(
    (id: string, patch: Partial<OverlayElement>, commitNow = true) => {
      mutate(
        (current) =>
          current.map((element) =>
            element.id === id ? clampElement({ ...element, ...patch }) : element,
          ),
        commitNow,
      )
    },
    [mutate],
  )

  const remove = useCallback(
    (id: string) => {
      mutate((current) => current.filter((element) => element.id !== id))
      setSelectedId((current) => (current === id ? null : current))
    },
    [mutate],
  )

  const duplicate = useCallback(
    (id: string) => {
      let created: string | null = null
      mutate((current) => {
        const source = current.find((element) => element.id === id)
        if (!source || current.length >= ELEMENT_LIMIT) return current
        const copy = createElement({ ...source, x: source.x + 5, y: source.y + 5 })
        created = copy.id
        return [...current, copy]
      })
      if (created) setSelectedId(created)
    },
    [mutate],
  )

  const moveLayer = useCallback(
    (id: string, direction: -1 | 1) => {
      mutate((current) => {
        const index = current.findIndex((element) => element.id === id)
        const target = index + direction
        if (index < 0 || target < 0 || target >= current.length) return current
        const next = [...current]
        const [moved] = next.splice(index, 1)
        next.splice(target, 0, moved)
        return next
      })
    },
    [mutate],
  )

  const undo = useCallback(() => {
    setPast((currentPast) => {
      if (currentPast.length === 0) return currentPast
      const previous = currentPast[currentPast.length - 1]
      setElements((current) => {
        setFuture((currentFuture) => [current, ...currentFuture].slice(0, HISTORY_LIMIT))
        return previous
      })
      return currentPast.slice(0, -1)
    })
    setResult(null)
  }, [])

  const redo = useCallback(() => {
    setFuture((currentFuture) => {
      if (currentFuture.length === 0) return currentFuture
      const next = currentFuture[0]
      setElements((current) => {
        setPast((currentPast) => [...currentPast, current].slice(-HISTORY_LIMIT))
        return next
      })
      return currentFuture.slice(1)
    })
    setResult(null)
  }, [])

  const setViewZoom = useCallback((zoom: number) => {
    setViewZoomState(clamp(zoom, 0.1, 4))
  }, [])

  // --- export -------------------------------------------------------------

  const exportCanvas = useCallback(async () => {
    if (!jobId) {
      onError('Upload an image first.')
      return
    }
    if (canvas.mode === 'image' && !baseImage) {
      onError('Upload an image first.')
      return
    }
    setExporting(true)
    try {
      const response = await api.compose(jobId, {
        mode: canvas.mode,
        baseImageId: canvas.mode === 'image' ? baseImage?.id : undefined,
        preset: canvas.mode === 'card' ? canvas.preset : undefined,
        width: canvas.width,
        height: canvas.height,
        background: canvas.background,
        transparent: canvas.transparent,
        elements: elementsPayload(elements),
        export: { quality: canvas.quality, outputFormat: canvas.outputFormat },
      })
      setResult(response)
    } catch (cause) {
      fail(cause, 'The canvas could not be exported.')
    } finally {
      setExporting(false)
    }
  }, [baseImage, canvas, elements, fail, jobId, onError])

  const reset = useCallback(async () => {
    if (jobId) {
      try {
        await api.deleteJob(jobId)
      } catch {
        // Already gone - clearing locally is enough.
      }
    }
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url))
    objectUrls.current.clear()
    setJobId(null)
    setBaseImage(null)
    setAssets([])
    setElements([])
    setSelectedId(null)
    setCanvasState(DEFAULT_CANVAS)
    setResult(null)
    setPast([])
    setFuture([])
    setViewZoomState(1)
  }, [jobId])

  const assetMap = useMemo(
    () => Object.fromEntries(assets.map((asset) => [asset.id, asset])),
    [assets],
  )

  const selected = useMemo(
    () => elements.find((element) => element.id === selectedId) ?? null,
    [elements, selectedId],
  )

  return {
    jobId,
    baseImage,
    assets,
    assetMap,
    canvas,
    frame,
    elements,
    selectedId,
    selected,
    isUploading,
    isExporting,
    result,
    viewZoom,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    uploadBase,
    uploadAsset,
    removeAsset,
    setCanvas,
    setMode,
    addText,
    addImageElement,
    uploadCatalogImage,
    createCatalogSlide,
    select: setSelectedId,
    update,
    remove,
    duplicate,
    moveLayer,
    setViewZoom,
    undo,
    redo,
    commit,
    exportCanvas,
    reset,
  }
}
