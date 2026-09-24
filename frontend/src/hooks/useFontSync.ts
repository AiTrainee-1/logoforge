/**
 * Load the server's fonts into the page.
 *
 * `/api/capabilities` reports a font URL only for faces the deployer dropped
 * into `backend/assets/fonts`. When that happens the preview and the export
 * draw with identical glyphs; otherwise the preview falls back to a generic
 * face and the match is close but not exact.
 *
 * Two independent families are loaded:
 *  - "default" -> `--font-label`, the original face every existing text
 *    element (Studio's labels, plain composer stamps) already renders with.
 *  - "serif"   -> `--font-catalog`, the Catalog Composer's editorial face.
 * Nothing outside the Catalog Composer references `--font-catalog`, so
 * loading it changes nothing about how Studio or plain Composer text look.
 */
import { useEffect, useState } from 'react'

import { api, type Capabilities } from '@/services/api'

const CSS_FAMILY: Record<string, string> = {
  default: 'LogoForgeLabel',
  serif: 'LogoForgeSerif',
}

const CSS_VAR: Record<string, string> = {
  default: '--font-label',
  serif: '--font-catalog',
}

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
  'crimsontext-regular': 'Crimson Text',
  'crimsontext-semibold': 'Crimson Text',
}

const FALLBACK_STACK: Record<string, string> = {
  default: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
  serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif",
}

export interface FontSync {
  family: string | null
  serverFont: string | null
  /** Human-friendly name of the "default" typeface ("Arial", "DejaVu
   * Sans", …) - the one every existing text element already renders with. */
  displayName: string | null
  /** Human-friendly name of the Catalog Composer's serif typeface. */
  serifDisplayName: string | null
}

function prettify(stem: string): string {
  return stem
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

async function loadFamily(
  key: 'default' | 'serif',
  labelFont: string | null,
  urls: { bold?: string; regular?: string },
): Promise<string | null> {
  const equivalent = CSS_EQUIVALENT[(labelFont ?? '').toLowerCase()]
  if (equivalent) {
    document.documentElement.style.setProperty(
      CSS_VAR[key],
      `'${equivalent}', ${FALLBACK_STACK[key]}`,
    )
  }

  const faces: FontFace[] = []
  const cssFamily = CSS_FAMILY[key]
  if (urls.bold) faces.push(new FontFace(cssFamily, `url(${api.fileUrl(urls.bold)})`, { weight: '700' }))
  if (urls.regular) {
    faces.push(new FontFace(cssFamily, `url(${api.fileUrl(urls.regular)})`, { weight: '400' }))
  }
  if (faces.length > 0) {
    await Promise.all(
      faces.map(async (face) => {
        const loaded = await face.load()
        document.fonts.add(loaded)
      }),
    )
    // A bundled face wins: identical glyphs on both sides.
    document.documentElement.style.setProperty(
      CSS_VAR[key],
      `'${cssFamily}', ${FALLBACK_STACK[key]}`,
    )
  }

  return equivalent ?? (labelFont ? prettify(labelFont) : null)
}

export function useFontSync(): FontSync {
  const [family, setFamily] = useState<string | null>(null)
  const [serverFont, setServerFont] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [serifDisplayName, setSerifDisplayName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      let capabilities: Capabilities
      try {
        capabilities = await api.capabilities()
      } catch {
        // The API may be down; the preview simply uses its fallback fonts.
        return
      }
      if (cancelled) return

      setServerFont(capabilities.labelFont ?? null)
      const fonts = capabilities.fonts ?? {
        default: { label: capabilities.labelFont, urls: capabilities.fontUrls ?? {} },
      }

      const defaultInfo = fonts.default
      if (defaultInfo) {
        const name = await loadFamily('default', defaultInfo.label, defaultInfo.urls)
        if (!cancelled) {
          setDisplayName(name)
          if (Object.keys(defaultInfo.urls).length > 0) setFamily(CSS_FAMILY.default)
        }
      }

      const serifInfo = fonts.serif
      if (serifInfo) {
        const name = await loadFamily('serif', serifInfo.label, serifInfo.urls)
        if (!cancelled) setSerifDisplayName(name)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return { family, serverFont, displayName, serifDisplayName }
}
