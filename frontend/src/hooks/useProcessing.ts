/**
 * Batch processing: start the render, poll progress, expose the results.
 *
 * The payload sent here is the whole contract with the backend - the same
 * transform numbers the preview used are what the server renders from the
 * original uploaded files.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { api, ApiError } from '@/services/api'
import type {
  CharacterLabelSettings,
  ExportSettings,
  LogoSettings,
  ProcessedResult,
  UploadedImage,
} from '@/types/editor'
import { alphabeticLabel } from '@/utils/labels'
import { elementsPayload } from '@/utils/overlays'

export type ProcessingPhase = 'idle' | 'processing' | 'done' | 'error'

export interface UseProcessing {
  phase: ProcessingPhase
  progress: number
  completed: number
  failed: number
  total: number
  results: ProcessedResult[]
  error: string | null
  zipUrl: string | null
  start: (input: {
    jobId: string
    images: UploadedImage[]
    logo: LogoSettings
    label: CharacterLabelSettings
    exportSettings: ExportSettings
  }) => Promise<void>
  reset: () => void
}

const POLL_INTERVAL = 600

export function useProcessing(onError: (message: string) => void): UseProcessing {
  const [phase, setPhase] = useState<ProcessingPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [completed, setCompleted] = useState(0)
  const [failed, setFailed] = useState(0)
  const [total, setTotal] = useState(0)
  const [results, setResults] = useState<ProcessedResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [zipUrl, setZipUrl] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  const stopPolling = useCallback(() => {
    if (timer.current !== null) {
      window.clearInterval(timer.current)
      timer.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const reset = useCallback(() => {
    stopPolling()
    setPhase('idle')
    setProgress(0)
    setCompleted(0)
    setFailed(0)
    setTotal(0)
    setResults([])
    setError(null)
    setZipUrl(null)
  }, [stopPolling])

  const start = useCallback<UseProcessing['start']>(
    async ({ jobId, images, logo, label, exportSettings }) => {
      stopPolling()
      setPhase('processing')
      setError(null)
      setResults([])
      setProgress(0)
      setCompleted(0)
      setFailed(0)
      setTotal(images.length)

      const payload = {
        order: images.map((image) => image.id),
        transforms: Object.fromEntries(
          images.map((image) => [image.id, image.transform]),
        ),
        // Extra letters, keyed by image id - each image sends only its own.
        overlays: Object.fromEntries(
          images
            .filter((image) => image.overlays.length > 0)
            .map((image) => [image.id, elementsPayload(image.overlays)]),
        ),
        logo: {
          position: logo.position,
          sizePercent: logo.sizePercent,
          margin: logo.margin,
          opacity: logo.opacity,
          rotation: logo.rotation,
          customX: logo.customX,
          customY: logo.customY,
        },
        character: {
          enabled: label.enabled,
          fontSize: label.fontSize,
          color: label.color,
          opacity: label.opacity,
          bottomMargin: label.bottomMargin,
          bold: label.bold,
          background: label.background,
          backgroundColor: label.backgroundColor,
          backgroundOpacity: label.backgroundOpacity,
        },
        export: {
          format: exportSettings.format,
          fit: exportSettings.fit,
          quality: exportSettings.quality,
          background: exportSettings.background,
          keepTransparency: exportSettings.keepTransparency,
        },
      }

      try {
        await api.process(jobId, payload)
      } catch (cause) {
        const message =
          cause instanceof ApiError ? cause.message : 'Processing could not be started.'
        setPhase('error')
        setError(message)
        onError(message)
        return
      }

      const poll = async () => {
        try {
          const status = await api.status(jobId)
          setProgress(status.progress ?? 0)
          setCompleted(status.completed ?? 0)
          setFailed(status.failed ?? 0)
          setTotal(status.total ?? images.length)

          if (status.status === 'completed' || status.status === 'partial' || status.status === 'failed') {
            stopPolling()
            const final = await api.results(jobId)
            setResults(
              final.results.map((entry, index) => ({
                ...entry,
                label: entry.label ?? alphabeticLabel(index),
              })),
            )
            setZipUrl(api.zipUrl(jobId))
            setPhase(status.status === 'failed' ? 'error' : 'done')
            if (status.status === 'failed') {
              const message = 'None of the images could be processed.'
              setError(message)
              onError(message)
            }
          }
        } catch (cause) {
          stopPolling()
          const message =
            cause instanceof ApiError ? cause.message : 'Lost contact with the server.'
          setPhase('error')
          setError(message)
          onError(message)
        }
      }

      timer.current = window.setInterval(poll, POLL_INTERVAL)
      void poll()
    },
    [onError, stopPolling],
  )

  return {
    phase,
    progress,
    completed,
    failed,
    total,
    results,
    error,
    zipUrl,
    start,
    reset,
  }
}
