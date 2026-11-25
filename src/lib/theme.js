// Update 52: the colour modes. Light mode and dark mode were already there; Custom mode is the third: the look of the sign-in page's
// brand panel (deep navy, with two soft curves in the bottom corner) for the whole app.
// Update 53: Custom mode is the DEFAULT mode, the one everybody sees until they choose another from the menu.
//
// This is the ONE list of the modes, and what is saved and put on the page:
//   * only a mode the person CHOOSES from the menu is kept, in this browser (localStorage, 'sns-theme-choice'), so it is remembered on
//     this phone or computer. Opening the app saves nothing, and the device's own light / dark setting decides nothing: a browser
//     that has never been asked starts in Custom mode;
//   * the key the first two versions used ('sns-theme') is not read any more. Update 52 wrote the mode on EVERY visit, chosen or not,
//     so what that key holds is the device's guess and not a choice, and reading it would keep every browser that has already opened
//     the app in Light or Dark mode, and the new default would never be seen. So each browser starts in Custom mode once, and a person
//     who wants Light or Dark mode picks it again;
//   * it is put on the page as data-theme on <html>. The colours themselves, and the curved background of Custom mode, are in
//     src/styles/index.css ([data-theme="light"] is the plain :root, then [data-theme="dark"] and [data-theme="custom"]).
// index.html carries a few lines that do the same thing before the first paint (and has data-theme="custom" on <html> to begin with),
// so the mode never flashes the wrong colours. A test fails if they ever disagree with this file.
//
// Nothing here can throw: a private window, or a browser that blocks storage, simply forgets the choice when it is closed.

export const THEME_STORAGE_KEY = 'sns-theme-choice'
export const DEFAULT_THEME = 'custom'

// key: what is saved and what data-theme says; label: what the person reads. The menu lists them in this order.
export const THEMES = [
  { key: 'light', label: 'Light mode' },
  { key: 'dark', label: 'Dark mode' },
  { key: 'custom', label: 'Custom mode' },
]

export const isTheme = (value) => THEMES.some((t) => t.key === value)
export const themeLabel = (key) => (THEMES.find((t) => t.key === key) || THEMES.find((t) => t.key === DEFAULT_THEME)).label

const browserStorage = () => { try { return window.localStorage } catch { return null } }

// The mode this browser saved (one the person chose), or null (nothing saved, something that is not a mode, or storage that cannot
// be read).
export function readSavedTheme(storage = browserStorage()) {
  try {
    const value = storage ? storage.getItem(THEME_STORAGE_KEY) : null
    return isTheme(value) ? value : null
  } catch { return null }
}

// The mode to start in: the one the person chose, and otherwise Custom mode. Nothing else is asked (not the device's setting).
export function initialTheme({ storage = browserStorage() } = {}) {
  return readSavedTheme(storage) || DEFAULT_THEME
}

// Remember the mode the person chose. Returns false when the browser would not keep it (the page still shows it until it is closed).
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
