import { useEffect, useState } from 'react'

// The current time, refreshed every minute and whenever the window is shown again, so that "Active" turns into
// "Inactive" on screen at the moment a subscription runs out, without anyone reloading the page.
export default function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    const id = setInterval(tick, intervalMs)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', onVisible) }
  }, [intervalMs])
  return now
}
