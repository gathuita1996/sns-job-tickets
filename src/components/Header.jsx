import { useEffect, useState } from 'react'
import { LogOut, Moon, Sun, UserCog } from 'lucide-react'
import ProfileFormModal from './ProfileForm'
import logoIcon from '../assets/logo-icon.png'

// Self-contained: reads the saved preference (or the system default on first
// visit), and keeps localStorage + the document's data-theme attribute in
// sync whenever it changes. Lives here rather than in App.jsx since it's a
// purely visual concern that both dashboards' Headers can each own
// independently -- only one is ever mounted at a time.
function useTheme() {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('sns-theme')
    if (stored === 'dark' || stored === 'light') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('sns-theme', theme)
  }, [theme])

  return [theme, setTheme]
}

export default function Header({ currentUser, onLogout, onUpdateProfile, subtitle }) {
  const [editingProfile, setEditingProfile] = useState(false)
  const [theme, setTheme] = useTheme()

  return (
    <header className="no-print sns-border-b sns-bg-card" style={{ position: 'sticky', top: 0, zIndex: 30 }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between" style={{ paddingTop: '0.85rem', paddingBottom: '0.85rem' }}>
        <div className="flex items-center gap-3">
          <div className="sns-brand-mark" style={{ width: 36, height: 36 }}><img src={logoIcon} alt="Swahili Net Solution" /></div>
          <div>
            <p className="sns-display" style={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.15 }}>Swahili Net Solution</p>
            <p className="sns-eyebrow sns-text-faint">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setEditingProfile(true)} title="Edit my profile" className="hidden sm:block text-right" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{currentUser.fullName}</p>
            <p className="sns-eyebrow sns-text-faint">{currentUser.role === 'admin' ? (currentUser.title || 'Admin') : 'Member'}</p>
          </button>
          <button onClick={() => setEditingProfile(true)} title="Edit my profile" className="sns-icon-btn sm:hidden">
            <UserCog size={16} />
          </button>
          <button onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} className="sns-btn-secondary" style={{ padding: '0.5rem' }}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={onLogout} title="Log out" className="sns-btn-secondary" style={{ padding: '0.5rem' }}>
            <LogOut size={16} />
          </button>
        </div>
      </div>
      {editingProfile && (
        <ProfileFormModal
          profile={currentUser}
          isSelf
          onClose={() => setEditingProfile(false)}
          onSave={async (updates) => { await onUpdateProfile(currentUser.id, updates); setEditingProfile(false) }}
        />
      )}
    </header>
  )
}
