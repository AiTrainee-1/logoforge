/**
 * Load the server's label font into the page when one is bundled.
 *
 * `/api/capabilities` reports a font URL only for faces the deployer dropped
 * into `backend/assets/fonts`. When that happens the preview and the export
 * draw with identical glyphs; otherwise the preview falls back to Inter and
 * the match is close but not exact.
 */
import { useEffect, useState } from 'react'

import { api } from '@/services/api'

const FAMILY = 'LogoForgeLabel'

/**
 * Server font file -> the CSS family that is the same typeface. When the
 * browser happens to have it installed (very common in local development,
 * where the API runs on the same machine) the preview matches the export
 * without shipping any font at all.
 */
const CSS_EQUIVALENT: Record<string, string> = {
  arial: 'Arial',
  arialbd: 'Arial',
  segoeui: 'Segoe UI',
  seguisb: 'Segoe UI',
  dejavusans: 'DejaVu Sans',
  'dejavusans-bold': 'DejaVu Sans',
  'liberationsans-regular': 'Liberation Sans',
  'liberationsans-bold': 'Liberation Sans',
  'inter-regular': 'Inter',
  'inter-bold': 'Inter',
}

const FALLBACK_STACK =
  "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"

export interface FontSync {
  family: string | null
  serverFont: string | null
  /** Human-friendly name of the typeface actually used ("Arial", "DejaVu
   * Sans", …) - the one and only font the whole app (Studio, Composer,
   * Catalog Composer) renders with, so preview and export always match. */
  displayName: string | null
}

function prettify(stem: string): string {
  return stem
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function useFontSync(): FontSync {
  const [family, setFamily] = useState<string | null>(null)
  const [serverFont, setServerFont] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const capabilities = await api.capabilities()
        if (cancelled) return
        setServerFont(capabilities.labelFont ?? null)

        // Even without a bundled file, ask for the same typeface by name.
        const equivalent = CSS_EQUIVALENT[(capabilities.labelFont ?? '').toLowerCase()]
        setDisplayName(equivalent ?? (capabilities.labelFont ? prettify(capabilities.labelFont) : null))
        if (equivalent) {
          document.documentElement.style.setProperty(
            '--font-label',
            `'${equivalent}', ${FALLBACK_STACK}`,
          )
        }

        const urls = capabilities.fontUrls ?? {}
        const faces: FontFace[] = []
        if (urls.bold) {
          faces.push(new FontFace(FAMILY, `url(${api.fileUrl(urls.bold)})`, { weight: '700' }))
        }
        if (urls.regular) {
          faces.push(
            new FontFace(FAMILY, `url(${api.fileUrl(urls.regular)})`, { weight: '400' }),
          )
        }
        if (faces.length === 0) return

        await Promise.all(
          faces.map(async (face) => {
            const loaded = await face.load()
            document.fonts.add(loaded)
          }),
        )
        if (cancelled) return
        // A bundled face wins: identical glyphs on both sides.
        document.documentElement.style.setProperty(
          '--font-label',
          `'${FAMILY}', ${FALLBACK_STACK}`,
        )
        setFamily(FAMILY)
      } catch {
        // The API may be down; the preview simply uses its fallback font.
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return { family, serverFont, displayName }
}
