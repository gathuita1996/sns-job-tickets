import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import ProfileFormModal from './ProfileForm'
import ThemeMenu from './ThemeMenu'
import Avatar from './Avatar'
import logoIcon from '../assets/logo-icon.png'
import { applyTheme, initialTheme, saveTheme } from '../lib/theme'

// Self-contained: starts in the saved mode (or the device's default on the first visit), and keeps the browser's storage + the
// document's data-theme attribute in sync whenever it changes. Update 52: three modes (light, dark, custom), chosen from a menu
// (ThemeMenu); the list of modes and how they are saved is in lib/theme.js.
function useTheme() {
  const [theme, setTheme] = useState(() => initialTheme())
  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
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

  // The profile window is a sibling of the header, not inside it: the header is its own layer (z-index 30), and a window inside it
  // would sit UNDER the job form (z-index 50) when "Update my profile" is pressed in that form. At 55 it opens above the job form
  // (what was typed there stays) and still under the toasts and confirmations (60).
  return (
    <>
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
          <ThemeMenu theme={theme} onChange={setTheme} />
          <button onClick={onLogout} title="Log out" className="sns-btn-secondary" style={{ padding: '0.5rem' }}><LogOut size={16} /></button>
        </div>
      </div>
    </header>
    {openTab && (
      <ProfileFormModal
        profile={currentUser} isSelf canEditNumber={false} settings={settings} leave={profileExtras.leave} leaveBadge={profileExtras.leaveBadge} data={profileExtras.data} contract={profileExtras.contract}
        initialTab={openTab} bank={profileExtras.bank} layer={55}
        onUploadAvatar={profileExtras.onUploadAvatar} onRemoveAvatar={profileExtras.onRemoveAvatar}
        onClose={() => setOpenTab(null)}
        onSave={async (updates, bank) => { const saved = await onUpdateProfile(currentUser.id, updates, bank); if (saved !== false) setOpenTab(null) }}
      />
    )}
    </>
  )
}
