import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { mapProfile, mapJob, jobToDbFields } from './lib/mappers'
import { LoadingScreen, Toast } from './components/shared'
import { LoginView, SignupView, ForgotPasswordView, ResetPasswordView } from './components/Auth'
import MemberDashboard from './components/MemberDashboard'
import AdminDashboard from './components/AdminDashboard'

export default function App() {
  const [booting, setBooting] = useState(true)
  const [currentUser, setCurrentUser] = useState(null)
  const [jobs, setJobs] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [authView, setAuthView] = useState('login')
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [toast, setToast] = useState(null)
  const currentUserRef = useRef(null)

  function showToast(message, type) { setToast({ message, type: type || 'success' }) }

  async function loadProfileAndData(userId) {
    const { data: profileRow, error: profileErr } = await supabase
      .from('profiles').select('*').eq('id', userId).single()

    if (profileErr || !profileRow) {
      // Extremely rare: the profile row is created by a database trigger
      // right after signup, so this can only happen if that trigger failed.
      setAuthError('Your account was created but your profile could not be loaded. Please contact your admin.')
      setBooting(false)
      return
    }

    const profile = mapProfile(profileRow)
    currentUserRef.current = profile
    setCurrentUser(profile)
    await refreshJobs()
    if (profile.role === 'admin') await refreshUsers()
    setBooting(false)
  }

  async function refreshJobs() {
    const { data, error } = await supabase.from('jobs').select('*')
    if (error) { showToast('Failed to load job cards.', 'error'); return }
    setJobs((data || []).map(mapJob))
  }

  async function refreshUsers() {
    const { data, error } = await supabase.from('profiles').select('*')
    if (error) return
    setAllUsers((data || []).map(mapProfile))
  }

  // Single source of truth for auth state. Handles first load, sign-in,
  // sign-out, and the password-recovery link redirect.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthView('reset')
        setBooting(false)
        return
      }
      if (event === 'SIGNED_OUT') {
        currentUserRef.current = null
        setCurrentUser(null)
        setJobs([])
        setAllUsers([])
        setAuthView('login')
        setBooting(false)
        return
      }
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        if (session?.user) loadProfileAndData(session.user.id)
        else setBooting(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Realtime: keep everyone's view in sync when any job card changes,
  // mirroring the shared, always-current data everyone had before.
  useEffect(() => {
    if (!currentUser) return
    const channel = supabase
      .channel('jobs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => {
        refreshJobs()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id])

  async function handleSignup(form) {
    setAuthError('')
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            username: form.username.trim(),
            full_name: form.fullName.trim(),
            contact: form.contact.trim(),
            title: form.title.trim() || null,
		access_code: form.accessCode.trim(),
          },
        },
      })
      if (error) {
        const msg = (error.message || '').toLowerCase()
	 if (msg.includes('invalid_access_code')) setAuthError('That access code is incorrect. Ask an admin for the current one.')
        if (msg.includes('username')) setAuthError('That username is already taken. Please choose another.')
        else if (msg.includes('already registered') || msg.includes('already been registered')) setAuthError('An account with that email already exists.')
        else if (msg.includes('duplicate') || msg.includes('unique constraint')) setAuthError('That username is already taken. Please choose another.')
        else setAuthError(error.message)
        return
      }
      if (data.session) {
        // Email confirmation is off in your Supabase project — signed in immediately.
        showToast('Account created. Welcome to Swahili Net Solution!')
      } else {
        // Email confirmation is on (Supabase's default) — they must confirm before logging in.
        setAuthNotice('Account created! Check your email to confirm it, then log in.')
        setAuthView('login')
      }
    } catch (err) {
      setAuthError('Something went wrong. Please try again.')
    }
  }

  async function handleLogin(email, password) {
    setAuthError('')
    setAuthNotice('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError(error.message.includes('Invalid login credentials') ? 'Incorrect email or password.' : error.message)
      return false
    }
    return true
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  async function handleForgotPassword(email) {
    setAuthError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    if (error) { setAuthError(error.message); return false }
    return true
  }

  async function handleResetPassword(newPassword) {
    setAuthError('')
    const { data, error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setAuthError(error.message); return }
    showToast('Password updated!')
    if (data?.user) await loadProfileAndData(data.user.id)
  }

  async function handleAddJob(formData) {
    const { error } = await supabase.from('jobs').insert({ ...jobToDbFields(formData), member_id: currentUserRef.current.id })
    if (error) { showToast('Failed to save job card.', 'error'); return }
    showToast('Job card filed successfully.')
    await refreshJobs()
  }

  async function handleUpdateJob(id, formData) {
    const { error } = await supabase.from('jobs').update(jobToDbFields(formData)).eq('id', id)
    if (error) { showToast('Failed to update job card.', 'error'); return }
    showToast('Job card updated.')
    await refreshJobs()
  }

  async function handleDeleteJob(id) {
    const { error } = await supabase.from('jobs').delete().eq('id', id)
    if (error) { showToast('Failed to delete job card.', 'error'); return }
    showToast('Job card deleted.')
    await refreshJobs()
  }

  async function handlePromote(member) {
    const { error } = await supabase.from('profiles').update({ role: 'admin' }).eq('id', member.id)
    if (error) { showToast('Failed to promote. Please try again.', 'error'); return }
    showToast(`${member.fullName} is now an admin.`)
    await refreshUsers()
  }

  if (booting) return <LoadingScreen />

  if (authView === 'reset') {
    return (<>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <ResetPasswordView onResetPassword={handleResetPassword} error={authError} />
    </>)
  }

  if (!currentUser) {
    return (<>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {authView === 'signup' && (
        <SignupView onSignup={handleSignup} onSwitch={() => { setAuthView('login'); setAuthError(''); setAuthNotice('') }} error={authError} />
      )}
      {authView === 'forgot' && (
        <ForgotPasswordView onRequestReset={handleForgotPassword} onSwitch={() => { setAuthView('login'); setAuthError('') }} error={authError} />
      )}
      {authView === 'login' && (
        <LoginView
          onLogin={handleLogin}
          onSwitch={() => { setAuthView('signup'); setAuthError(''); setAuthNotice('') }}
          onForgot={() => { setAuthView('forgot'); setAuthError('') }}
          error={authError}
          notice={authNotice}
        />
      )}
    </>)
  }

  return (<>
    {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    {currentUser.role === 'admin'
      ? <AdminDashboard currentUser={currentUser} users={allUsers} jobs={jobs} onLogout={handleLogout} onUpdateJob={handleUpdateJob} onDeleteJob={handleDeleteJob} onPromote={handlePromote} />
      : <MemberDashboard currentUser={currentUser} jobs={jobs.filter((j) => j.memberId === currentUser.id)} onLogout={handleLogout} onAddJob={handleAddJob} onUpdateJob={handleUpdateJob} onDeleteJob={handleDeleteJob} />}
  </>)
}
