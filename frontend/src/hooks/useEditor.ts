/**
 * Global (non per-image) editor state: logo, character label, export settings
 * and the *view* zoom.
 *
 * View zoom only changes how large the canvas is drawn on screen. It is
 * deliberately separate from `ImageTransform.scale`, which changes the
 * exported pixels.
 */
import { useCallback, useState } from 'react'

import type {
  CharacterLabelSettings,
  EditorView,
  ExportSettings,
  ImageTransform,
  LogoSettings,
} from '@/types/editor'
import {
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_LABEL_SETTINGS,
  DEFAULT_LOGO_SETTINGS,
} from '@/types/editor'
import { clamp } from '@/utils/transforms'

export const VIEW_ZOOM_MIN = 0.4
export const VIEW_ZOOM_MAX = 2.5

export interface UseEditor {
  logoSettings: LogoSettings
  labelSettings: CharacterLabelSettings
  exportSettings: ExportSettings
  view: EditorView
  clipboard: ImageTransform | null
  showBefore: boolean

  setLogoSettings: (patch: Partial<LogoSettings>) => void
  setLabelSettings: (patch: Partial<CharacterLabelSettings>) => void
  setExportSettings: (patch: Partial<ExportSettings>) => void
  setViewZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  resetView: () => void
  setClipboard: (transform: ImageTransform | null) => void
  setShowBefore: (value: boolean) => void
  resetSettings: () => void
}

export function useEditor(): UseEditor {
  const [logoSettings, setLogo] = useState<LogoSettings>(DEFAULT_LOGO_SETTINGS)
  const [labelSettings, setLabel] = useState<CharacterLabelSettings>(DEFAULT_LABEL_SETTINGS)
  const [exportSettings, setExport] = useState<ExportSettings>(DEFAULT_EXPORT_SETTINGS)
  const [view, setView] = useState<EditorView>({ zoom: 1 })
  const [clipboard, setClipboard] = useState<ImageTransform | null>(null)
  const [showBefore, setShowBefore] = useState(false)

  const setLogoSettings = useCallback((patch: Partial<LogoSettings>) => {
    setLogo((current) => ({ ...current, ...patch }))
  }, [])

  const setLabelSettings = useCallback((patch: Partial<CharacterLabelSettings>) => {
    setLabel((current) => ({ ...current, ...patch }))
  }, [])

  const setExportSettings = useCallback((patch: Partial<ExportSettings>) => {
    setExport((current) => ({ ...current, ...patch }))
  }, [])

  const setViewZoom = useCallback((zoom: number) => {
    setView({ zoom: clamp(zoom, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX) })
  }, [])

  const zoomIn = useCallback(() => {
    setView((current) => ({ zoom: clamp(current.zoom + 0.1, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX) }))
  }, [])

  const zoomOut = useCallback(() => {
    setView((current) => ({ zoom: clamp(current.zoom - 0.1, VIEW_ZOOM_MIN, VIEW_ZOOM_MAX) }))
  }, [])

  const resetView = useCallback(() => setView({ zoom: 1 }), [])

  const resetSettings = useCallback(() => {
    setLogo(DEFAULT_LOGO_SETTINGS)
    setLabel(DEFAULT_LABEL_SETTINGS)
    setExport(DEFAULT_EXPORT_SETTINGS)
    setView({ zoom: 1 })
    setClipboard(null)
    setShowBefore(false)
  }, [])

  return {
    logoSettings,
    labelSettings,
    exportSettings,
    view,
    clipboard,
    showBefore,
    setLogoSettings,
    setLabelSettings,
    setExportSettings,
    setViewZoom,
    zoomIn,
    zoomOut,
    resetView,
    setClipboard,
    setShowBefore,
    resetSettings,
  }
}
