import { useEffect, useRef, useState } from 'react'
import { Check, Moon, Palette, Sun } from 'lucide-react'
import { DEFAULT_THEME, THEMES, themeLabel } from '../lib/theme'

// Update 52: one small button at the top of every page that shows the mode in use (a sun, a moon or a palette) and opens a menu to
// choose between Light mode, Dark mode and Custom mode. The choice is made by the page (Header), which saves it (Update 53: only a
// choice made here is saved, and Custom mode, the default, is what the button shows until one is made).
// Keyboard: Enter / Space opens it, the arrow keys, Home and End move between the three, Enter chooses, Escape closes and puts the
// focus back on the button. A click or touch anywhere else closes it too.
const ICONS = { light: Sun, dark: Moon, custom: Palette }

export default function ThemeMenu({ theme, onChange }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const CurrentIcon = ICONS[theme] || ICONS[DEFAULT_THEME]      // a mode it does not know is shown as the default (label and icon agree)

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const keys = (e) => { if (e.key === 'Escape') { setOpen(false); if (buttonRef.current) buttonRef.current.focus() } }
    document.addEventListener('mousedown', away)
    document.addEventListener('touchstart', away)
    document.addEventListener('keydown', keys)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('touchstart', away)
      document.removeEventListener('keydown', keys)
    }
  }, [open])

  // When the menu opens, the focus goes to the mode in use.
  useEffect(() => {
    if (!open || !wrapRef.current) return
    const current = wrapRef.current.querySelector('[role="menuitemradio"][aria-checked="true"]') || wrapRef.current.querySelector('[role="menuitemradio"]')
    if (current) current.focus()
  }, [open])

  function moveFocus(e) {
    const items = [...wrapRef.current.querySelectorAll('[role="menuitemradio"]')]
    const at = items.indexOf(document.activeElement)
    let to = null
    if (e.key === 'ArrowDown') to = (at + 1) % items.length
    else if (e.key === 'ArrowUp') to = (at - 1 + items.length) % items.length
    else if (e.key === 'Home') to = 0
    else if (e.key === 'End') to = items.length - 1
    if (to === null) return
    e.preventDefault()
    items[to].focus()
  }

  function choose(key) {
    setOpen(false)
    if (buttonRef.current) buttonRef.current.focus()
    if (key !== theme) onChange(key)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        ref={buttonRef} type="button" className="sns-btn-secondary" style={{ padding: '0.5rem' }} data-testid="theme-button"
        aria-haspopup="menu" aria-expanded={open} aria-label={`${themeLabel(theme)}. Change mode`} title={`${themeLabel(theme)} (change mode)`}
        onClick={() => setOpen((o) => !o)}
      >
        <CurrentIcon size={16} />
      </button>
      {open && (
        <div role="menu" aria-label="Mode" className="sns-card sns-theme-menu" onKeyDown={moveFocus}>
          {THEMES.map((t) => {
            const Icon = ICONS[t.key]
            const on = t.key === theme
            return (
              <button key={t.key} type="button" role="menuitemradio" aria-checked={on} className={`sns-theme-option${on ? ' active' : ''}`} data-theme-choice={t.key} onClick={() => choose(t.key)}>
                <Icon size={15} />
                <span>{t.label}</span>
                {on && <Check size={14} className="sns-theme-check" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
