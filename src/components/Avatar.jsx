import { useState } from 'react'

// A round profile picture, or the person's initials when there is none (or it fails to load).
export default function Avatar({ name = '', url = '', size = 38, title }) {
  const [broken, setBroken] = useState(false)
  const initials = String(name).trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
  if (url && !broken) {
    return <img src={url} alt={name ? `${name}'s picture` : 'Profile picture'} title={title} onError={() => setBroken(true)}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: 'var(--signal-pale)' }} />
  }
  return (
    <div aria-label={name || 'No picture'} title={title} style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: 'var(--signal-pale)', color: 'var(--signal-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: Math.max(11, size * 0.38) }}>
      {initials}
    </div>
  )
}
