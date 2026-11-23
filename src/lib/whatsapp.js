// Opening WhatsApp from a button press.
//
// A browser only lets a page open a new tab while it is answering a click. But a receipt has to be made and saved first,
// which takes a moment, so by the time the message is ready the click is long over and the tab would be blocked. So a
// blank tab is opened right away, inside the click, and sent to WhatsApp as soon as the message is ready.
export function openPendingWindow(label = 'Opening WhatsApp…') {
  let win = null
  try { win = window.open('', '_blank') } catch { win = null }
  if (win) {
    try { win.opener = null } catch { /* not allowed: harmless */ }
    try { win.document.title = label; win.document.body.style.cssText = 'font-family:sans-serif;padding:2rem;color:#4C5F72'; win.document.body.textContent = label } catch { /* the tab is not ours to write in: harmless */ }
  }
  return {
    opened: Boolean(win),
    // Sends the waiting tab to WhatsApp. Returns false when there is no tab (blocked or closed), so the screen can offer a link instead.
    go(url) {
      if (win && !win.closed) { try { win.location.href = url; return true } catch { return false } }
      return false
    },
    close() { try { if (win && !win.closed) win.close() } catch { /* harmless */ } },
  }
}
