/**
 * Image list + editing session state.
 *
 * Every image owns its transform. `updateTransform` only ever writes the one
 * entry it is given, so editing image A can never move image B.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api, ApiError } from '@/services/api'
import type { ImageTransform, LogoAsset, OverlayElement, UploadedImage } from '@/types/editor'
import { DEFAULT_TRANSFORM } from '@/types/editor'
import { normaliseTransform } from '@/utils/transforms'
import { clampElement, createElement, ELEMENT_LIMIT } from '@/utils/overlays'
import { createThumbnail } from '@/utils/thumbnails'

/** What undo/redo restores for one image: its transform *and* its elements. */
interface ImageState {
  transform: ImageTransform
  overlays: OverlayElement[]
}

type StateMap = Record<string, ImageState>

const HISTORY_LIMIT = 60

export interface UseImages {
  jobId: string | null
  images: UploadedImage[]
  logo: LogoAsset | null
  selectedIndex: number
  selected: UploadedImage | null
  isUploading: boolean
  uploadProgress: number
  error: string | null

  addFiles: (files: File[]) => Promise<void>
  removeImage: (id: string) => Promise<void>
  removeAll: () => Promise<void>
  reorder: (from: number, to: number) => void
  select: (index: number) => void
  next: () => void
  previous: () => void

  updateTransform: (id: string, patch: Partial<ImageTransform>, commit?: boolean) => void
  commitHistory: () => void
  resetTransform: (id: string) => void
  applyTransformToAll: (transform: ImageTransform) => void
  transformFor: (id: string) => ImageTransform

  // Extra letters / text, stored per image and never shared between them.
  selectedOverlayId: string | null
  selectOverlay: (elementId: string | null) => void
  addOverlay: (imageId: string, overrides?: Partial<OverlayElement>) => void
  updateOverlay: (
    imageId: string,
    elementId: string,
    patch: Partial<OverlayElement>,
    commit?: boolean,
  ) => void
  removeOverlay: (imageId: string, elementId: string) => void
  duplicateOverlay: (imageId: string, elementId: string) => void
  clearOverlays: (imageId: string) => void
  copyOverlaysToAll: (imageId: string) => void

  setLogoFile: (file: File) => Promise<void>
  clearLogo: () => Promise<void>

  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function useImages(onError: (message: string) => void): UseImages {
  const [jobId, setJobId] = useState<string | null>(null)
  const [images, setImages] = useState<UploadedImage[]>([])
  const [logo, setLogo] = useState<LogoAsset | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isUploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [past, setPast] = useState<StateMap[]>([])
  const [future, setFuture] = useState<StateMap[]>([])
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null)
  /** Snapshot taken when a gesture starts, pushed onto the stack when it ends. */
  const pendingSnapshot = useRef<StateMap | null>(null)
  const objectUrls = useRef<Set<string>>(new Set())

  // Release object URLs when the tab goes away.
  useEffect(() => {
    const urls = objectUrls.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  const snapshot = useCallback(
    (list: UploadedImage[]): StateMap =>
      Object.fromEntries(
        list.map((image) => [
          image.id,
          {
            transform: { ...image.transform },
            overlays: image.overlays.map((element) => ({ ...element })),
          },
        ]),
      ),
    [],
  )

  const restore = useCallback(
    (list: UploadedImage[], map: StateMap): UploadedImage[] =>
      list.map((image) =>
        map[image.id]
          ? {
              ...image,
              transform: { ...map[image.id].transform },
              overlays: map[image.id].overlays.map((element) => ({ ...element })),
            }
          : image,
      ),
    [],
  )

  const fail = useCallback(
    (cause: unknown, fallback: string) => {
      const message = cause instanceof ApiError ? cause.message : fallback
      setError(message)
      onError(message)
    },
    [onError],
  )

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setUploading(true)
      setUploadProgress(0)
      setError(null)
      try {
        const response = jobId
          ? await api.addImages(jobId, files, setUploadProgress)
          : await api.createJob(files, null, setUploadProgress)

        // The server answers in upload order, so index i belongs to files[i].
        const fresh = response.added ?? response.images
        const created: UploadedImage[] = []
        for (let index = 0; index < fresh.length; index += 1) {
          const record = fresh[index]
          const file = files[index]
          const previewUrl = file ? URL.createObjectURL(file) : ''
          if (previewUrl) objectUrls.current.add(previewUrl)
          created.push({
            id: record.id,
            name: record.name,
            width: record.width,
            height: record.height,
            size: record.size,
            format: record.format,
            mime: record.mime,
            hasAlpha: record.hasAlpha,
            previewUrl,
            thumbUrl: file ? await createThumbnail(file) : '',
            transform: { ...DEFAULT_TRANSFORM },
            overlays: [],
          })
        }

        setJobId(response.jobId)
        setImages((current) => (jobId ? [...current, ...created] : created))
        if (!jobId) setSelectedIndex(0)
        if (fresh.length !== files.length) {
          onError('Some files were skipped by the server.')
        }
      } catch (cause) {
        fail(cause, 'The upload failed. Please try again.')
      } finally {
        setUploading(false)
        setUploadProgress(0)
      }
    },
    [fail, jobId, onError],
  )

  const removeImage = useCallback(
    async (id: string) => {
      if (!jobId) return
      const target = images.find((image) => image.id === id)
      try {
        await api.removeImage(jobId, id)
      } catch (cause) {
        fail(cause, 'That image could not be removed.')
        return
      }
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl)
        objectUrls.current.delete(target.previewUrl)
      }
      setImages((current) => {
        const next = current.filter((image) => image.id !== id)
        setSelectedIndex((index) => Math.max(0, Math.min(index, next.length - 1)))
        return next
      })
    },
    [fail, images, jobId],
  )

  const removeAll = useCallback(async () => {
    if (jobId) {
      try {
        await api.deleteJob(jobId)
      } catch {
        // The session may already have expired; clearing locally is enough.
      }
    }
    images.forEach((image) => {
      if (image.previewUrl) {
        URL.revokeObjectURL(image.previewUrl)
        objectUrls.current.delete(image.previewUrl)
      }
    })
    if (logo?.previewUrl) URL.revokeObjectURL(logo.previewUrl)
    setImages([])
    setLogo(null)
    setJobId(null)
    setSelectedIndex(0)
    setPast([])
    setFuture([])
  }, [images, jobId, logo])

  const reorder = useCallback((from: number, to: number) => {
    setImages((current) => {
      if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) {
        return current
      }
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setSelectedIndex(to)
  }, [])

  const select = useCallback((index: number) => {
    setSelectedIndex((current) => (index === current ? current : index))
  }, [])

  const next = useCallback(() => {
    setSelectedIndex((index) => (images.length ? (index + 1) % images.length : 0))
  }, [images.length])

  const previous = useCallback(() => {
    setSelectedIndex((index) =>
      images.length ? (index - 1 + images.length) % images.length : 0,
    )
  }, [images.length])

  // Derived rather than stored: removing the last image must not leave the
  // selection pointing past the end of the list.
  const safeIndex = images.length === 0 ? 0 : Math.min(selectedIndex, images.length - 1)

  const pushHistory = useCallback((before: StateMap) => {
    setPast((current) => [...current, before].slice(-HISTORY_LIMIT))
    setFuture([])
  }, [])

  const updateTransform = useCallback(
    (id: string, patch: Partial<ImageTransform>, commit = true) => {
      setImages((current) => {
        if (!pendingSnapshot.current) {
          pendingSnapshot.current = snapshot(current)
        }
        return current.map((image) =>
          image.id === id
            ? { ...image, transform: normaliseTransform({ ...image.transform, ...patch }) }
            : image,
        )
      })
      if (commit) {
        const before = pendingSnapshot.current
        pendingSnapshot.current = null
        if (before) pushHistory(before)
      }
    },
    [pushHistory, snapshot],
  )

  /** Ends a drag/slider gesture: one history entry for the whole gesture. */
  const commitHistory = useCallback(() => {
    const before = pendingSnapshot.current
    pendingSnapshot.current = null
    if (before) pushHistory(before)
  }, [pushHistory])

  const resetTransform = useCallback(
    (id: string) => {
      setImages((current) => {
        pushHistory(snapshot(current))
        return current.map((image) =>
          image.id === id ? { ...image, transform: { ...DEFAULT_TRANSFORM } } : image,
        )
      })
    },
    [pushHistory, snapshot],
  )

  const applyTransformToAll = useCallback(
    (transform: ImageTransform) => {
      setImages((current) => {
        pushHistory(snapshot(current))
        return current.map((image) => ({ ...image, transform: { ...transform } }))
      })
    },
    [pushHistory, snapshot],
  )

  const transformFor = useCallback(
    (id: string) => images.find((image) => image.id === id)?.transform ?? DEFAULT_TRANSFORM,
    [images],
  )

  const undo = useCallback(() => {
    setPast((currentPast) => {
      if (currentPast.length === 0) return currentPast
      const previousMap = currentPast[currentPast.length - 1]
      setImages((current) => {
        setFuture((currentFuture) => [snapshot(current), ...currentFuture].slice(0, HISTORY_LIMIT))
        return restore(current, previousMap)
      })
      return currentPast.slice(0, -1)
    })
  }, [restore, snapshot])

  const redo = useCallback(() => {
    setFuture((currentFuture) => {
      if (currentFuture.length === 0) return currentFuture
      const nextMap = currentFuture[0]
      setImages((current) => {
        setPast((currentPast) => [...currentPast, snapshot(current)].slice(-HISTORY_LIMIT))
        return restore(current, nextMap)
      })
      return currentFuture.slice(1)
    })
  }, [restore, snapshot])

  // ------------------------------------------------------------------
  // Extra letters. Every write names the image it belongs to, so editing
  // one image's elements can never touch another's.
  // ------------------------------------------------------------------

  const mutateOverlays = useCallback(
    (
      imageId: string,
      mutate: (elements: OverlayElement[]) => OverlayElement[],
      commit = true,
    ) => {
      setImages((current) => {
        if (commit) {
          pushHistory(snapshot(current))
        } else if (!pendingSnapshot.current) {
          pendingSnapshot.current = snapshot(current)
        }
        return current.map((image) =>
          image.id === imageId ? { ...image, overlays: mutate(image.overlays) } : image,
        )
      })
    },
    [pushHistory, snapshot],
  )

  const selectOverlay = useCallback((elementId: string | null) => {
    setSelectedOverlayId(elementId)
  }, [])

  const addOverlay = useCallback(
    (imageId: string, overrides: Partial<OverlayElement> = {}) => {
      const element = createElement(overrides)
      mutateOverlays(imageId, (elements) =>
        elements.length >= ELEMENT_LIMIT ? elements : [...elements, element],
      )
      setSelectedOverlayId(element.id)
    },
    [mutateOverlays],
  )

  const updateOverlay = useCallback(
    (imageId: string, elementId: string, patch: Partial<OverlayElement>, commit = true) => {
      mutateOverlays(
        imageId,
        (elements) =>
          elements.map((element) =>
            element.id === elementId ? clampElement({ ...element, ...patch }) : element,
          ),
        commit,
      )
    },
    [mutateOverlays],
  )

  const removeOverlay = useCallback(
    (imageId: string, elementId: string) => {
      mutateOverlays(imageId, (elements) =>
        elements.filter((element) => element.id !== elementId),
      )
      setSelectedOverlayId((current) => (current === elementId ? null : current))
    },
    [mutateOverlays],
  )

  const duplicateOverlay = useCallback(
    (imageId: string, elementId: string) => {
      let created: string | null = null
      mutateOverlays(imageId, (elements) => {
        const source = elements.find((element) => element.id === elementId)
        if (!source || elements.length >= ELEMENT_LIMIT) return elements
        const copy = createElement({ ...source, x: source.x + 5, y: source.y + 5 })
        created = copy.id
        return [...elements, copy]
      })
      if (created) setSelectedOverlayId(created)
    },
    [mutateOverlays],
  )

  const clearOverlays = useCallback(
    (imageId: string) => {
      mutateOverlays(imageId, () => [])
      setSelectedOverlayId(null)
    },
    [mutateOverlays],
  )

  /** Explicit action: copy one image's elements onto every other image. */
  const copyOverlaysToAll = useCallback(
    (imageId: string) => {
      setImages((current) => {
        const source = current.find((image) => image.id === imageId)
        if (!source) return current
        pushHistory(snapshot(current))
        return current.map((image) =>
          image.id === imageId
            ? image
            : {
                ...image,
                overlays: source.overlays.map((element) =>
                  createElement({ ...element }),
                ),
              },
        )
      })
    },
    [pushHistory, snapshot],
  )

  const setLogoFile = useCallback(
    async (file: File) => {
      try {
        let activeJob = jobId
        if (!activeJob) {
          const created = await api.createJob([], file)
          activeJob = created.jobId
          setJobId(activeJob)
          if (created.logo) {
            const previewUrl = URL.createObjectURL(file)
            objectUrls.current.add(previewUrl)
            setLogo({ ...created.logo, previewUrl })
          }
          return
        }
        const response = await api.uploadLogo(activeJob, file)
        if (logo?.previewUrl) {
          URL.revokeObjectURL(logo.previewUrl)
          objectUrls.current.delete(logo.previewUrl)
        }
        const previewUrl = URL.createObjectURL(file)
        objectUrls.current.add(previewUrl)
        setLogo({ ...response.logo, previewUrl })
      } catch (cause) {
        fail(cause, 'The logo could not be uploaded.')
      }
    },
    [fail, jobId, logo],
  )

  const clearLogo = useCallback(async () => {
    if (jobId) {
      try {
        await api.clearLogo(jobId)
      } catch (cause) {
        fail(cause, 'The logo could not be removed.')
        return
      }
    }
    if (logo?.previewUrl) {
      URL.revokeObjectURL(logo.previewUrl)
      objectUrls.current.delete(logo.previewUrl)
    }
    setLogo(null)
  }, [fail, jobId, logo])

  const selected = useMemo(() => images[safeIndex] ?? null, [images, safeIndex])

  return {
    jobId,
    images,
    logo,
    selectedIndex: safeIndex,
    selected,
    isUploading,
    uploadProgress,
    error,
    addFiles,
    removeImage,
    removeAll,
    reorder,
    select,
    next,
    previous,
    updateTransform,
    commitHistory,
    resetTransform,
    applyTransformToAll,
    transformFor,
    selectedOverlayId,
    selectOverlay,
    addOverlay,
    updateOverlay,
    removeOverlay,
    duplicateOverlay,
    clearOverlays,
    copyOverlaysToAll,
    setLogoFile,
    clearLogo,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  }
}
