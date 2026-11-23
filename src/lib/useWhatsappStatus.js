import { useCallback, useEffect, useRef, useState } from 'react'
import { getWhatsappStatus } from './whatsappApi.js'

// Is automatic WhatsApp sending set up? Asked once when the screen opens, and again whenever the window comes back into
// focus (someone may just have changed the settings in Netlify). `status` is null until the first answer arrives; after that
// it is what getWhatsappStatus gives: { available, configured, missing, webhookReady, template, problem? }.
export default function useWhatsappStatus(client, enabled = true) {
  const [status, setStatus] = useState(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const reload = useCallback(async () => {
    if (!client) return null
    const next = await getWhatsappStatus(client)
    if (alive.current) setStatus(next)
    return next
  }, [client])

  useEffect(() => { if (enabled) reload() }, [enabled, reload])
  useEffect(() => {
    if (!enabled) return undefined
    const onFocus = () => { reload() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [enabled, reload])

  return { status, reload }
}
