// Update 52: the colour modes. Light mode and dark mode were already there; Custom mode is the third: the look of the sign-in page's
// brand panel (deep navy, with two soft curves in the bottom corner) for the whole app.
//
// This is the ONE list of the modes, and what is saved and put on the page:
//   * the choice is kept in this browser (localStorage, 'sns-theme'), so it is remembered on this phone or computer;
//   * it is put on the page as data-theme on <html>. The colours themselves, and the curved background of Custom mode, are in
//     src/styles/index.css ([data-theme="light"] is the plain :root, then [data-theme="dark"] and [data-theme="custom"]).
// index.html carries a few lines that do the same thing before the first paint, so a saved mode never flashes the wrong colours.
// A test fails if they ever disagree with this file.
//
// Nothing here can throw: a private window, or a browser that blocks storage, simply forgets the choice when it is closed.

export const THEME_STORAGE_KEY = 'sns-theme'
export const DEFAULT_THEME = 'light'

// key: what is saved and what data-theme says; label: what the person reads.
export const THEMES = [
  { key: 'light', label: 'Light mode' },
  { key: 'dark', label: 'Dark mode' },
  { key: 'custom', label: 'Custom mode' },
]

export const isTheme = (value) => THEMES.some((t) => t.key === value)
export const themeLabel = (key) => (THEMES.find((t) => t.key === key) || THEMES[0]).label

const browserStorage = () => { try { return window.localStorage } catch { return null } }
const browserMatchMedia = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : null)

// The mode this browser saved, or null (nothing saved, something that is not a mode, or storage that cannot be read).
export function readSavedTheme(storage = browserStorage()) {
  try {
    const value = storage ? storage.getItem(THEME_STORAGE_KEY) : null
    return isTheme(value) ? value : null
  } catch { return null }
}

// The mode to start in: the saved one; the first time, dark if the device is set to dark, otherwise light.
export function initialTheme({ storage = browserStorage(), matchMedia = browserMatchMedia() } = {}) {
  const saved = readSavedTheme(storage)
  if (saved) return saved
  try { return matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : DEFAULT_THEME } catch { return DEFAULT_THEME }
}

// Remember the mode. Returns false when the browser would not keep it (the page still shows it until it is closed).
export function saveTheme(theme, storage = browserStorage()) {
  if (!isTheme(theme)) return false
  try { if (!storage) return false; storage.setItem(THEME_STORAGE_KEY, theme); return true } catch { return false }
}

// Put the mode on the page. Anything that is not a mode becomes the default, so the page is never left with colours that do not exist.
export function applyTheme(theme, root = typeof document !== 'undefined' ? document.documentElement : null) {
  const key = isTheme(theme) ? theme : DEFAULT_THEME
  if (root) root.setAttribute('data-theme', key)
  return key
}
