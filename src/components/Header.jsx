import { useEffect, useState } from 'react'
import { LogOut, Moon, Sun } from 'lucide-react'
import ProfileFormModal from './ProfileForm'
import Avatar from './Avatar'
import logoIcon from '../assets/logo-icon.png'

// Self-contained: reads the saved preference (or the system default on first visit), and keeps localStorage + the
// document's data-theme attribute in sync whenever it changes.
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

// profileExtras = { bank, leave, leaveBadge, onUploadAvatar, onRemoveAvatar }; profileRequest = { tab, n } opens the window on a tab
// (the dashboard's "My leave" card uses it).
export default function Header({ currentUser, onLogout, onUpdateProfile, subtitle, settings, profileExtras = {}, profileRequest }) {
  const [openTab, setOpenTab] = useState(null)
  const [theme, setTheme] = useTheme()
  useEffect(() => { if (profileRequest && profileRequest.n) setOpenTab(profileRequest.tab || 'profile') }, [profileRequest && profileRequest.n]) // eslint-disable-line react-hooks/exhaustive-deps
  const open = () => setOpenTab('profile')

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
          <button onClick={open} title={settings ? 'My profile & settings' : 'My profile'} className="hidden sm:flex items-center gap-2 text-right" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <div>
              <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{currentUser.fullName}</p>
              <p className="sns-eyebrow sns-text-faint">{currentUser.role === 'admin' ? (currentUser.title || 'Admin') : 'Member'}</p>
            </div>
            <Avatar name={currentUser.fullName} url={currentUser.avatarUrl} size={34} />
          </button>
          <button onClick={open} title={settings ? 'My profile & settings' : 'My profile'} aria-label="My profile" className="sm:hidden" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <Avatar name={currentUser.fullName} url={currentUser.avatarUrl} size={32} />
          </button>
          <button onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} className="sns-btn-secondary" style={{ padding: '0.5rem' }}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={onLogout} title="Log out" className="sns-btn-secondary" style={{ padding: '0.5rem' }}><LogOut size={16} /></button>
        </div>
      </div>
      {openTab && (
        <ProfileFormModal
          profile={currentUser} isSelf canEditNumber={false} settings={settings} leave={profileExtras.leave} leaveBadge={profileExtras.leaveBadge} data={profileExtras.data}
          initialTab={openTab} bank={profileExtras.bank}
          onUploadAvatar={profileExtras.onUploadAvatar} onRemoveAvatar={profileExtras.onRemoveAvatar}
          onClose={() => setOpenTab(null)}
          onSave={async (updates, bank) => { await onUpdateProfile(currentUser.id, updates, bank); setOpenTab(null) }}
        />
      )}
    </header>
  )
}
