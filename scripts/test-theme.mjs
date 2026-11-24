// Update 52: Custom mode, the third colour mode (Light mode, Dark mode, Custom mode).
// Plain logic and plain files only (no browser, no database):
//   1. src/lib/theme.js: the list of modes, what is remembered, what happens when the browser will not remember anything;
//   2. the few lines in index.html that put the saved mode on the page before it is first drawn, RUN here against every kind of
//      browser (storage that works, that throws, that is blocked; a device set to dark, to light, or that cannot say) and compared
//      with theme.js, so the two can never disagree (a disagreement is a flash of the wrong colours on every page load);
//   3. src/styles/index.css: every colour name is set in every mode, Light and Dark keep the colours they had, Custom mode has the
//      colours of the sign-in page's brand panel (the picture it was made from), the writing in it is easy to read (the contrast is
//      worked out here, WCAG 2), the curved background is drawn only on a screen and never gets in the way of a click, and a printout
//      is always the light colours;
//   4. the screens: the header has the mode menu in place of the old two-way button, and the sign-in page's curves can be restyled.
// The behaviour of the menu itself (opening, the keys, choosing) is checked in a real browser by the maintainer's UI tests; those are
// not part of the shipped app.
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY, applyTheme, initialTheme, isTheme, readSavedTheme, saveTheme, themeLabel } from '../src/lib/theme.js'

let n = 0
const ok = async (name, fn) => { try { await fn(); n++ } catch (e) { console.error('FAIL', name, '\n', e && e.stack ? e.stack : e); process.exitCode = 1 } }
const read = (p) => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8')

const KEYS = ['light', 'dark', 'custom']
const DARK_QUERY = '(prefers-color-scheme: dark)'

// ---- a browser that can be made to misbehave ---------------------------------------------------------------------------
const memoryStorage = (initial = {}) => {
  const data = { ...initial }
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v) }, removeItem: (k) => { delete data[k] } }
}
const brokenStorage = (what) => ({
  getItem: () => { if (what === 'get' || what === 'both') throw new Error('SecurityError: storage is blocked'); return null },
  setItem: () => { if (what === 'set' || what === 'both') throw new Error('QuotaExceededError'); },
})
const device = (prefersDark) => { const asked = []; const f = (q) => { asked.push(q); return { matches: q === DARK_QUERY ? prefersDark : false } }; f.asked = asked; return f }

// ======================================================================================================================
// 1. The modes (src/lib/theme.js)
// ======================================================================================================================
await ok('there are three modes, with the names the person reads: Light mode, Dark mode and Custom mode', () => {
  assert.deepEqual(THEMES.map((t) => t.key), KEYS)
  assert.deepEqual(THEMES.map((t) => t.label), ['Light mode', 'Dark mode', 'Custom mode'])
  assert.equal(DEFAULT_THEME, 'light')
  assert.equal(THEME_STORAGE_KEY, 'sns-theme', 'the key the earlier two-mode button used, so a saved Dark mode is still there after the update')
  for (const k of KEYS) assert.equal(themeLabel(k), THEMES.find((t) => t.key === k).label)
  assert.equal(themeLabel('nonsense'), 'Light mode', 'an unknown mode is shown as the default, never as an empty label')
  assert.equal(themeLabel(undefined), 'Light mode')
})

await ok('only the three exact names are modes (no other case, no spaces, no look-alikes)', () => {
  for (const k of KEYS) assert.equal(isTheme(k), true, k)
  for (const v of ['', ' ', null, undefined, 0, 1, true, {}, [], ['dark'], 'Light', 'Dark', 'CUSTOM', 'Custom mode', ' dark', 'dark ', 'light\n', 'blue', 'auto', 'system', 'null', 'undefined']) assert.equal(isTheme(v), false, JSON.stringify(v))
})

await ok('a saved mode is read back; anything else, or a browser that will not answer, means "nothing saved"', () => {
  for (const k of KEYS) assert.equal(readSavedTheme(memoryStorage({ [THEME_STORAGE_KEY]: k })), k, k)
  assert.equal(readSavedTheme(memoryStorage()), null)
  assert.equal(readSavedTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'blue' })), null)
  assert.equal(readSavedTheme(memoryStorage({ [THEME_STORAGE_KEY]: 'Dark' })), null)
  assert.equal(readSavedTheme(memoryStorage({ [THEME_STORAGE_KEY]: '' })), null)
  assert.equal(readSavedTheme(memoryStorage({ other: 'dark' })), null, 'only the key sns-theme counts')
  assert.equal(readSavedTheme(brokenStorage('get')), null)
  assert.equal(readSavedTheme(brokenStorage('both')), null)
  assert.equal(readSavedTheme(null), null)
})

await ok('the first visit follows the device (dark if the device is set to dark, otherwise light); a saved mode always wins', () => {
  assert.equal(initialTheme({ storage: memoryStorage(), matchMedia: device(true) }), 'dark')
  assert.equal(initialTheme({ storage: memoryStorage(), matchMedia: device(false) }), 'light')
  const m = device(true)
  initialTheme({ storage: memoryStorage(), matchMedia: m })
  assert.deepEqual(m.asked, [DARK_QUERY], 'it asks the device only whether it prefers dark')
  for (const saved of KEYS) {
    for (const dark of [true, false]) {
      const asked = device(dark)
      assert.equal(initialTheme({ storage: memoryStorage({ [THEME_STORAGE_KEY]: saved }), matchMedia: asked }), saved, `${saved} on a ${dark ? 'dark' : 'light'} device`)
      assert.deepEqual(asked.asked, [], 'a saved mode does not even ask the device')
    }
  }
  // saved text that is not a mode is ignored, so the device decides
  assert.equal(initialTheme({ storage: memoryStorage({ [THEME_STORAGE_KEY]: 'blue' }), matchMedia: device(true) }), 'dark')
  assert.equal(initialTheme({ storage: memoryStorage({ [THEME_STORAGE_KEY]: 'blue' }), matchMedia: device(false) }), 'light')
})

await ok('a device that cannot say, or storage that cannot be read, gives Light mode and never an error', () => {
  const throwing = () => { throw new Error('no') }
  const noMatches = () => ({})
  assert.equal(initialTheme({ storage: memoryStorage(), matchMedia: null }), 'light')
  assert.equal(initialTheme({ storage: memoryStorage(), matchMedia: throwing }), 'light')
  assert.equal(initialTheme({ storage: memoryStorage(), matchMedia: noMatches }), 'light')
  assert.equal(initialTheme({ storage: brokenStorage('get'), matchMedia: device(true) }), 'dark', 'a blocked store falls back to the device')
  assert.equal(initialTheme({ storage: null, matchMedia: device(false) }), 'light')
  assert.equal(initialTheme({ storage: brokenStorage('both'), matchMedia: throwing }), 'light')
  // called with nothing at all in a plain Node (no window, no document): still an answer
  assert.equal(initialTheme({ storage: null, matchMedia: null }), 'light')
})

await ok('a chosen mode is remembered, and only a real mode is', () => {
  for (const k of KEYS) {
    const s = memoryStorage()
    assert.equal(saveTheme(k, s), true, k)
    assert.deepEqual(s.data, { [THEME_STORAGE_KEY]: k })
    assert.equal(readSavedTheme(s), k)
    // the next visit starts where the person left off, whichever way the device leans
    assert.equal(initialTheme({ storage: s, matchMedia: device(k !== 'dark') }), k)
  }
  for (const v of ['', null, undefined, 'Dark', 'blue', 'light ', 0, {}, ['dark']]) {
    const s = memoryStorage()
    assert.equal(saveTheme(v, s), false, JSON.stringify(v))
    assert.deepEqual(s.data, {}, `${JSON.stringify(v)} is not saved`)
  }
})

await ok('a browser that will not keep the choice just forgets it (the page still changes), with no error', () => {
  assert.equal(saveTheme('custom', brokenStorage('set')), false)
  assert.equal(saveTheme('custom', brokenStorage('both')), false)
  assert.equal(saveTheme('custom', null), false)
})

await ok('choosing a mode puts it on the page as data-theme; anything else becomes Light mode; no page at all is fine', () => {
  for (const k of KEYS) {
    const root = { attrs: {}, setAttribute(a, v) { this.attrs[a] = v } }
    assert.equal(applyTheme(k, root), k)
    assert.deepEqual(root.attrs, { 'data-theme': k })
  }
  for (const v of ['', null, undefined, 'Dark', 'blue', 0, {}]) {
    const root = { attrs: {}, setAttribute(a, val) { this.attrs[a] = val } }
    assert.equal(applyTheme(v, root), 'light', JSON.stringify(v))
    assert.deepEqual(root.attrs, { 'data-theme': 'light' }, 'the page is never left with colours that do not exist')
  }
  assert.equal(applyTheme('custom', null), 'custom')
})

// ======================================================================================================================
// 2. Before the first paint (index.html)
// ======================================================================================================================
const html = read('index.html')
const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'))

await ok('index.html puts the saved mode on the page from a plain script in the head, before the stylesheet and before the app', () => {
  const scripts = [...head.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  assert.equal(scripts.length, 1, 'one inline script in the head')
  assert.equal(scripts[0][1].trim(), '', 'a plain script: no type=module, no defer, no async (those would run after the first paint)')
  const at = (s) => html.indexOf(s)
  assert.ok(at('<script>') > at('<meta charset'), 'after the character set is declared')
  assert.ok(at('<script>') < at('<link'), 'before any stylesheet or font link')
  assert.ok(at('<script>') < at('<body>'), 'before the page body')
  assert.ok(at('<script>') < at('src="/src/main.jsx"'), 'before the app starts')
  const code = scripts[0][2]
  assert.ok(code.includes(`'${THEME_STORAGE_KEY}'`), 'it reads the same key theme.js saves under')
  for (const k of KEYS) assert.ok(code.includes(`'${k}'`), `it knows the mode "${k}"`)
  assert.ok(code.includes(DARK_QUERY), 'and asks the device the same question')
  assert.ok(code.includes('data-theme'), 'and sets the same attribute')
})

// the inline script, run for real
const inlineCode = (/<script\b[^>]*>([\s\S]*?)<\/script>/.exec(head) || [null, ''])[1]
function runInline({ saved, storage, device: dev }) {
  const attrs = {}
  const sandbox = { document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v } } } }
  sandbox.window = sandbox
  if (storage === 'blocked') Object.defineProperty(sandbox, 'localStorage', { get() { throw new Error('SecurityError: access is denied') } })
  else sandbox.localStorage = { getItem: (key) => { if (storage === 'throws') throw new Error('boom'); return key === THEME_STORAGE_KEY ? saved : null } }
  if (dev === 'dark' || dev === 'light') sandbox.matchMedia = (q) => ({ matches: q === DARK_QUERY && dev === 'dark' })
  else if (dev === 'throws') sandbox.matchMedia = () => { throw new Error('boom') }
  // dev === 'missing': no matchMedia at all
  vm.runInContext(inlineCode, vm.createContext(sandbox))
  return attrs['data-theme']
}

await ok('the lines in index.html and theme.js give the same mode in every kind of browser (180 combinations)', () => {
  const SAVED = [null, 'light', 'dark', 'custom', '', 'Dark', 'CUSTOM', 'Light mode', ' dark', 'dark ', 'blue', 'auto', 'null', 'undefined', '{"theme":"dark"}']
  let compared = 0
  for (const storage of ['works', 'throws', 'blocked']) {
    for (const dev of ['dark', 'light', 'throws', 'missing']) {
      for (const saved of SAVED) {
        const fake = storage === 'works' ? memoryStorage(saved === null ? {} : { [THEME_STORAGE_KEY]: saved }) : storage === 'throws' ? brokenStorage('get') : null
        const mm = dev === 'dark' ? device(true) : dev === 'light' ? device(false) : dev === 'throws' ? () => { throw new Error('boom') } : null
        const expected = initialTheme({ storage: fake, matchMedia: mm })
        const got = runInline({ saved, storage, device: dev })
        const label = `saved=${JSON.stringify(saved)} storage=${storage} device=${dev}`
        if (got === undefined) {
          // The one case the lines leave the page unmarked: no usable saved mode and a device that cannot say. An unmarked page is
          // drawn with the plain :root colours, which ARE Light mode, so it is the same answer; theme.js marks it once the app starts.
          assert.equal(expected, 'light', label)
          assert.ok(dev === 'throws' || dev === 'missing', label)
          assert.ok(!KEYS.includes(storage === 'works' ? saved : null), label)
        } else {
          assert.equal(got, expected, label)
        }
        compared++
      }
    }
  }
  assert.equal(compared, 180)
})

await ok('...and a saved mode really wins over the device, in the lines that run first', () => {
  for (const k of KEYS) for (const dev of ['dark', 'light', 'throws', 'missing']) assert.equal(runInline({ saved: k, storage: 'works', device: dev }), k, `${k} / ${dev}`)
  assert.equal(runInline({ saved: null, storage: 'works', device: 'dark' }), 'dark')
  assert.equal(runInline({ saved: null, storage: 'works', device: 'light' }), 'light')
  assert.equal(runInline({ saved: 'blue', storage: 'blocked', device: 'dark' }), 'dark')
})

// ======================================================================================================================
// 3. The colours (src/styles/index.css)
// ======================================================================================================================
const css = read('src/styles/index.css')
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// the text between the braces that open at `from` (nested braces counted)
function braced(text, from) {
  const open = text.indexOf('{', from)
  assert.ok(open >= 0, 'no { after position ' + from)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i)
  }
  return assert.fail('unbalanced braces')
}
// a rule whose selector starts a line: there must be exactly one
function rule(text, selector) {
  const hits = [...text.matchAll(new RegExp('^' + escapeRe(selector) + '\\s*\\{', 'gm'))]
  assert.equal(hits.length, 1, `expected exactly one "${selector} { ... }" at the start of a line, found ${hits.length}`)
  return braced(text, hits[0].index)
}
const tokensOf = (block) => Object.fromEntries([...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((m) => [m[1], m[2].trim()]))

let light = {}
let dark = {}
let custom = {}
await ok('the stylesheet has exactly one block of colours for each of the three modes (Light mode is the plain :root)', () => {
  light = tokensOf(rule(css, ':root'))
  dark = tokensOf(rule(css, '[data-theme="dark"]'))
  custom = tokensOf(rule(css, '[data-theme="custom"]'))
})
const FIXED = '--ink-fixed-dark'
const NAMES = Object.keys(light).filter((k) => k !== FIXED).sort()

await ok('every colour name is set in every mode (Custom mode leaves nothing to fall back on Light mode)', () => {
  assert.ok(NAMES.length >= 19, `found only ${NAMES.length} colour names`)
  for (const name of ['--ink', '--ink-soft', '--ink-faint', '--signal', '--signal-deep', '--signal-pale', '--stamp', '--stamp-deep', '--stamp-pale', '--confirmed', '--confirmed-pale', '--danger', '--danger-pale', '--overdue', '--overdue-pale', '--paper', '--card', '--line', '--line-soft']) assert.ok(NAMES.includes(name), name)
  assert.deepEqual(Object.keys(dark).sort(), NAMES, 'Dark mode sets exactly the names Light mode sets')
  assert.deepEqual(Object.keys(custom).sort(), NAMES, 'Custom mode sets exactly the names Light mode sets')
  for (const [mode, t] of [['light', light], ['dark', dark], ['custom', custom]]) for (const name of NAMES) assert.match(t[name], /^#[0-9A-Fa-f]{6}$/, `${mode} ${name}: ${t[name]}`)
})

await ok('the one colour that stays the same in every mode (the dark panel and the toasts) is set once, in Light mode, and not changed by Dark or Custom', () => {
  assert.equal(light[FIXED], '#16232E')
  assert.equal(dark[FIXED], undefined)
  assert.equal(custom[FIXED], undefined)
  assert.equal((css.match(/--ink-fixed-dark\s*:/g) || []).length, 1, 'declared once anywhere in the stylesheet')
})

await ok('Light mode and Dark mode keep exactly the colours they had before update 52', () => {
  assert.deepEqual(light, {
    '--ink': '#16232E', '--ink-soft': '#4C5F72', '--ink-faint': '#8494A3',
    '--signal': '#1A4C93', '--signal-deep': '#123870', '--signal-pale': '#E7EFFA',
    '--stamp': '#F0781E', '--stamp-deep': '#D1620F', '--stamp-pale': '#FDF1E4',
    '--confirmed': '#1DA851', '--confirmed-pale': '#E6F7EC',
    '--danger': '#B3432F', '--danger-pale': '#FBEAE6',
    '--overdue': '#C0392B', '--overdue-pale': '#FBE4E1',
    '--paper': '#F7F9FC', '--card': '#FFFFFF', '--line': '#E1E7F0', '--line-soft': '#EEF2F8',
    '--ink-fixed-dark': '#16232E',
  })
  assert.deepEqual(dark, {
    '--ink': '#EDF1F5', '--ink-soft': '#A3B1BE', '--ink-faint': '#667482',
    '--signal': '#3D7DCC', '--signal-deep': '#6FA3E0', '--signal-pale': '#1C2E45',
    '--stamp': '#F5904A', '--stamp-deep': '#FBB27D', '--stamp-pale': '#3A2A18',
    '--confirmed': '#34C874', '--confirmed-pale': '#163825',
    '--danger': '#E17A63', '--danger-pale': '#3D211C',
    '--overdue': '#E0584A', '--overdue-pale': '#3D1E1A',
    '--paper': '#10161D', '--card': '#1A222B', '--line': '#2B3542', '--line-soft': '#222A34',
  })
})

await ok('Custom mode has the colours of the sign-in page\'s brand panel: its navy, its white headline, its grey sub-text and its two curves', () => {
  assert.equal(custom['--paper'].toUpperCase(), '#16232E', 'the page is the picture\'s navy (#16232E, the same as the panel)')
  assert.equal(custom['--paper'].toUpperCase(), light[FIXED].toUpperCase(), '...which is the panel\'s own colour in the sign-in page')
  assert.equal(custom['--ink'].toUpperCase(), '#FFFFFF', 'white headline')
  assert.equal(custom['--ink-soft'].toUpperCase(), '#AEB2B6', 'grey sub-text')
  assert.notEqual(custom['--card'].toUpperCase(), custom['--paper'].toUpperCase(), 'cards stand out from the page')
  // the two curves, in the screen background and in the sign-in panel
  const screen = rule(css, '@media screen')
  assert.ok(screen.includes('%23152940') && screen.includes('%23343339'), 'the background draws the picture\'s two curve colours (#152940 and #343339)')
  assert.match(css, /\[data-theme="custom"\] \.sns-auth-curve-a \{[^}]*fill:\s*#152940/)
  assert.match(css, /\[data-theme="custom"\] \.sns-auth-curve-b \{[^}]*fill:\s*#343339/)
})

// ---- reading contrast (WCAG 2: 4.5 for ordinary text) -------------------------------------------------------------------
const channel = (h, i) => parseInt(h.slice(i, i + 2), 16) / 255
const luminance = (h) => { const [r, g, b] = [1, 3, 5].map((i) => channel(h, i)).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

await ok('the contrast helper itself is right (black on white 21:1, a colour on itself 1:1, the same either way round)', () => {
  assert.ok(Math.abs(contrast('#000000', '#FFFFFF') - 21) < 1e-9)
  assert.ok(Math.abs(contrast('#16232E', '#16232E') - 1) < 1e-12)
  assert.equal(contrast('#1A4C93', '#FFFFFF'), contrast('#FFFFFF', '#1A4C93'))
  assert.ok(Math.abs(contrast('#737B82', '#16232E') - 3.72) < 0.01, 'the picture\'s small caption on its navy is only 3.7:1, which is why Custom mode\'s faint text is a little lighter')
})

await ok('in Custom mode the writing is easy to read on every background it is printed on (4.5:1 or more; the main text 7:1)', () => {
  const surfaces = ['--paper', '--card', '--line-soft', '--signal-pale', '--danger-pale', '--overdue-pale', '--confirmed-pale', '--stamp-pale']
  const need = (fg, bgs, min) => { for (const bg of bgs) { const r = contrast(custom[fg], custom[bg]); assert.ok(r >= min, `${fg} (${custom[fg]}) on ${bg} (${custom[bg]}) is ${r.toFixed(2)}:1, needs ${min}`) } }
  need('--ink', surfaces, 7)
  need('--ink-soft', surfaces, 4.5)
  need('--ink-faint', ['--paper', '--card'], 4.5)
  need('--ink-faint', surfaces, 4.0)
  need('--signal-deep', ['--paper', '--card', '--signal-pale'], 4.5)
  need('--danger', ['--paper', '--card', '--danger-pale'], 4.5)
  need('--overdue', ['--paper', '--card', '--overdue-pale'], 4.5)
  need('--confirmed', ['--paper', '--card', '--confirmed-pale'], 4.5)
  need('--stamp-deep', ['--paper', '--card', '--stamp-pale'], 4.5)
})

await ok('...and so are the buttons: white on the blue, the darker blue on hover, and navy writing on the red "delete" button', () => {
  assert.match(css, /\.sns-btn-primary \{[^}]*background: var\(--signal\); color: white;/, 'the primary button is white on --signal')
  assert.match(css, /\.sns-btn-danger \{ background: var\(--danger\); color: white;/, 'the base danger button is white on --danger')
  const screen = rule(css, '@media screen')
  const hover = /\[data-theme="custom"\] \.sns-btn-primary:hover:not\(:disabled\) \{ background: (#[0-9A-Fa-f]{6}); \}/.exec(screen)
  assert.ok(hover, 'Custom mode sets its own hover colour for the primary button (the ordinary one is light in a dark mode and would wash the white out)')
  const danger = /\[data-theme="custom"\] \.sns-btn-danger \{ color: (#[0-9A-Fa-f]{6}); \}/.exec(screen)
  const dangerHover = /\[data-theme="custom"\] \.sns-btn-danger:hover:not\(:disabled\) \{ background: (#[0-9A-Fa-f]{6}); \}/.exec(screen)
  assert.ok(danger && dangerHover, 'Custom mode sets the delete button\'s writing and hover colour')
  const r = (a, b) => contrast(a, b)
  assert.ok(r('#FFFFFF', custom['--signal']) >= 4.5, `white on --signal ${r('#FFFFFF', custom['--signal']).toFixed(2)}`)
  assert.ok(r('#FFFFFF', hover[1]) >= 4.5, `white on the hover blue ${r('#FFFFFF', hover[1]).toFixed(2)}`)
  assert.ok(r(danger[1], custom['--danger']) >= 4.5, `writing on --danger ${r(danger[1], custom['--danger']).toFixed(2)}`)
  assert.ok(r(danger[1], dangerHover[1]) >= 4.5, `writing on the danger hover ${r(danger[1], dangerHover[1]).toFixed(2)}`)
})

await ok('every data-theme in the stylesheet is a real mode, and every mode except the default has its colours', () => {
  const used = new Set([...css.matchAll(/data-theme="([^"]*)"/g)].map((m) => m[1]))
  for (const u of used) assert.ok(KEYS.includes(u), `the stylesheet styles a mode that does not exist: "${u}"`)
  for (const k of KEYS.filter((x) => x !== DEFAULT_THEME)) assert.ok(used.has(k), `no colours for the mode "${k}"`)
  assert.equal(css.includes('data-theme="light"'), false, 'Light mode is the plain :root colours; nothing is keyed to data-theme="light"')
})

await ok('Custom mode\'s curved background is drawn on a screen only, behind everything, and never takes a click', () => {
  const screen = rule(css, '@media screen')
  assert.equal((css.match(/body::before/g) || []).length, 1, 'the one place the curves are drawn')
  assert.ok(screen.includes('body::before'), '...inside @media screen, so a printout never carries it')
  const pseudo = braced(screen, screen.indexOf('body::before'))
  assert.match(pseudo, /content:\s*''/)
  assert.match(pseudo, /position:\s*fixed/, 'fixed to the window, so it stays in the corner while the page scrolls')
  assert.match(pseudo, /z-index:\s*-1/, 'behind the page')
  assert.match(pseudo, /pointer-events:\s*none/, 'a click or touch goes through it')
  assert.match(pseudo, /right:\s*0/); assert.match(pseudo, /bottom:\s*0/, 'in the bottom right corner, as on the sign-in page')
  assert.match(pseudo, /no-repeat right bottom/)
  assert.match(screen, /html\[data-theme="custom"\] \{[^}]*background: var\(--paper\)/, 'the page itself is the navy, so nothing white shows at the edges or when scrolling past the end')
  assert.match(screen, /html\[data-theme="custom"\] \{[^}]*color-scheme: dark/, 'the browser\'s own controls (date pickers, scroll bars, drop-down lists) are dark too')
  assert.match(screen, /html\[data-theme="custom"\] \.sns-shell \{ background: transparent; \}/, 'the app\'s shell lets the curves show through')
  assert.equal(/body::before[^{]*\{[^}]*data-theme="(?!custom)/.test(css), false)
  assert.ok(/html\[data-theme="custom"\] body::before/.test(css), 'and only in Custom mode: Light and Dark mode have no curves')
  // the curves are an inline picture, so there is nothing to download or to break
  assert.match(pseudo, /url\("data:image\/svg\+xml,/)
  assert.equal(/url\((?!"data:)/.test(pseudo), false, 'no outside file')
})

await ok('a printout is always the light colours, whichever mode is on the screen, and never carries the mode menu', () => {
  const at = css.indexOf(':root[data-theme="dark"], :root[data-theme="custom"]')
  assert.ok(at > 0, 'a print rule for both dark modes')
  assert.equal(css.indexOf(':root[data-theme="dark"], :root[data-theme="custom"]', at + 1), -1, 'one print rule')
  const printTokens = tokensOf(braced(css, at))
  const expected = Object.fromEntries(NAMES.map((k) => [k, light[k]]))
  assert.deepEqual(printTokens, expected, 'in print, every colour name is the Light mode colour')
  // that rule sits inside @media print
  const printAt = css.lastIndexOf('@media print', at)
  assert.ok(printAt >= 0 && braced(css, printAt).includes(':root[data-theme="dark"], :root[data-theme="custom"]'))
  assert.match(braced(css, printAt), /\.sns-theme-menu \{ display: none !important; \}/)
})

await ok('the sign-in page\'s two curves can be restyled: the other modes keep their brand colours, Custom mode draws the picture\'s', () => {
  const auth = read('src/components/Auth.jsx')
  assert.match(auth, /className="sns-auth-curves"/)
  assert.match(auth, /className="sns-auth-curve-a"[^>]*fill="var\(--signal-deep\)"/, 'the other modes: the same fill as before')
  assert.match(auth, /className="sns-auth-curve-b"[^>]*fill="var\(--stamp\)"/)
  assert.match(auth, /background: 'var\(--ink-fixed-dark\)'/, 'the panel is the fixed navy')
  assert.match(css, /\[data-theme="custom"\] \.sns-auth-curves \{ opacity: 1 !important; \}/)
  // the two paths are the same shapes the app's background draws (same numbers), so the picture and the app match
  const shapes = [...auth.matchAll(/ d="(M400,[^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(shapes, ['M400,120 C300,180 340,300 250,400 L400,400 Z', 'M400,220 C330,260 360,330 300,400 L400,400 Z'])
  const screen = rule(css, '@media screen')
  const picture = /url\("data:image\/svg\+xml,([^"]+)"\)/.exec(screen)
  assert.ok(picture, 'the background is an inline picture')
  const svg = decodeURIComponent(picture[1])
  for (const d of shapes) assert.ok(svg.includes(d), `the app background draws the same shape: ${d}`)
})

// ======================================================================================================================
// 4. The screens
// ======================================================================================================================
await ok('the header has the mode menu in place of the old two-way button, and the menu is built from the one list of modes', () => {
  const header = read('src/components/Header.jsx')
  assert.match(header, /import ThemeMenu from '\.\/ThemeMenu'/)
  assert.match(header, /<ThemeMenu theme=\{theme\} onChange=\{setTheme\} \/>/)
  assert.match(header, /import \{ applyTheme, initialTheme, saveTheme \} from '\.\.\/lib\/theme'/)
  assert.match(header, /useState\(\(\) => initialTheme\(\)\)/)
  assert.match(header, /applyTheme\(theme\)[\s\S]*saveTheme\(theme\)/)
  assert.equal(/\b(Moon|Sun)\b/.test(header), false, 'the old sun/moon toggle is gone from the header')
  const menu = read('src/components/ThemeMenu.jsx')
  assert.match(menu, /import \{ THEMES, themeLabel \} from '\.\.\/lib\/theme'/)
  assert.match(menu, /THEMES\.map\(/, 'one entry per mode in the list, so a fourth mode needs no change here beyond its icon')
  const icons = /const ICONS = \{([^}]*)\}/.exec(menu)
  assert.ok(icons, 'an icon for each mode')
  for (const k of KEYS) assert.match(icons[1], new RegExp(`\\b${k}:`), `an icon for "${k}"`)
  const menuCode = menu.replace(/^\s*\/\/.*$/gm, '')
  for (const label of ['Light mode', 'Dark mode', 'Custom mode']) assert.equal(menuCode.includes(label), false, `"${label}" comes from theme.js, not from the menu's code`)
  // what a screen reader and the keyboard get
  for (const needle of ['role="menu"', 'role="menuitemradio"', 'aria-checked={on}', 'aria-haspopup="menu"', 'aria-expanded={open}', "e.key === 'Escape'", "'ArrowDown'", "'ArrowUp'", "'Home'", "'End'", 'data-testid="theme-button"', 'data-theme-choice={t.key}']) assert.ok(menu.includes(needle), needle)
})

await ok('the test chain runs this file, and the guide for the update says where the modes are', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.match(pkg.scripts.test, /node scripts\/test-theme\.mjs/)
  const readme = read('README.md')
  assert.match(readme, /Custom mode/)
  assert.match(readme, /theme\.js/)
  assert.match(readme, /ThemeMenu\.jsx/)
})

console.log(`\n${n} colour-mode checks passed`)
