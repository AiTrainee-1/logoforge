/**
 * Editor keyboard shortcuts.
 *
 *   ← / →              previous / next image
 *   ↑ / ↓              nudge the image up / down
 *   Shift + arrows     nudge in any direction, larger step
 *   + / -              image scale
 *   R                  reset this image's transform
 *   Ctrl/Cmd + Z       undo          Ctrl/Cmd + Shift + Z   redo
 *   F                  fullscreen    B  before/after
 *
 * Shortcuts never fire while the user is typing in a field.
 */
import { useEffect } from 'react'

export interface KeyboardHandlers {
  enabled: boolean
  onPrevious: () => void
  onNext: () => void
  onNudge: (deltaX: number, deltaY: number) => void
  onScale: (delta: number) => void
  onCommit: () => void
  onReset: () => void
  onUndo: () => void
  onRedo: () => void
  onToggleFullscreen?: () => void
  onToggleBefore?: () => void
}

const STEP = 1
const FAST_STEP = 5
const SCALE_STEP = 0.05

/** Widgets that consume arrow keys themselves (Radix tabs, selects, sliders). */
const ARROW_OWNING_ROLES = new Set([
  'slider',
  'tab',
  'combobox',
  'listbox',
  'option',
  'menu',
  'menuitem',
  'radio',
  'radiogroup',
  'spinbutton',
  'textbox',
])

function shouldIgnore(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
    return true
  }
  const role = target.getAttribute('role')
  return role !== null && ARROW_OWNING_ROLES.has(role)
}

export function useKeyboardNavigation(handlers: KeyboardHandlers) {
  const {
    enabled,
    onPrevious,
    onNext,
    onNudge,
    onScale,
    onCommit,
    onReset,
    onUndo,
    onRedo,
    onToggleFullscreen,
    onToggleBefore,
  } = handlers

  useEffect(() => {
    if (!enabled) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnore(event.target)) return
      const meta = event.metaKey || event.ctrlKey
      const step = event.shiftKey ? FAST_STEP : STEP

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) onRedo()
        else onUndo()
        return
      }
      if (meta) return

      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          if (event.shiftKey) {
            onNudge(-step, 0)
            onCommit()
          } else {
            onPrevious()
          }
          return
        case 'ArrowRight':
          event.preventDefault()
          if (event.shiftKey) {
            onNudge(step, 0)
            onCommit()
          } else {
            onNext()
          }
          return
        case 'ArrowUp':
          event.preventDefault()
          onNudge(0, -step)
          onCommit()
          return
        case 'ArrowDown':
          event.preventDefault()
          onNudge(0, step)
          onCommit()
          return
        case '+':
        case '=':
          event.preventDefault()
          onScale(SCALE_STEP)
          onCommit()
          return
        case '-':
        case '_':
          event.preventDefault()
          onScale(-SCALE_STEP)
          onCommit()
          return
        default:
          break
      }

      switch (event.key.toLowerCase()) {
        case 'r':
          event.preventDefault()
          onReset()
          break
        case 'f':
          if (onToggleFullscreen) {
            event.preventDefault()
            onToggleFullscreen()
          }
          break
        case 'b':
          if (onToggleBefore) {
            event.preventDefault()
            onToggleBefore()
          }
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    enabled,
    onCommit,
    onNext,
    onNudge,
    onPrevious,
    onRedo,
    onReset,
    onScale,
    onToggleBefore,
    onToggleFullscreen,
    onUndo,
  ])
}
