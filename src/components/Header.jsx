import { LogOut } from 'lucide-react'
import logoIcon from '../assets/logo-icon.png'

export default function Header({ currentUser, onLogout, subtitle }) {
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
          <div className="hidden sm:block text-right">
            <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{currentUser.fullName}</p>
            <p className="sns-eyebrow sns-text-faint">{currentUser.role === 'admin' ? (currentUser.title || 'Admin') : 'Member'}</p>
          </div>
          <button onClick={onLogout} title="Log out" className="sns-btn-secondary" style={{ padding: '0.5rem' }}>
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  )
}
