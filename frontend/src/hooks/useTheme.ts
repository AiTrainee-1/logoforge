/** Light / dark theme, remembered between visits. */
import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'logoforge-theme'

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  // Always start on the off-white light theme - the brand identity - rather
  // than following the OS's dark-mode preference. Visitors can still switch.
  return 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Private browsing - the theme simply will not be remembered.
    }
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, setTheme, toggle }
}
