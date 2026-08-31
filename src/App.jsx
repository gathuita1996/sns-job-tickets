import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { mapProfile, mapJob, jobToDbFields, mapCustomer, customerToDbFields } from './lib/mappers'
import { COMMISSION_DEPARTMENTS } from './lib/helpers'
import { LoadingScreen, Toast } from './components/shared'
import { LoginView, SignupView, ForgotPasswordView, ResetPasswordView } from './components/Auth'
import MemberDashboard from './components/MemberDashboard'
import AdminDashboard from './components/AdminDashboard'

export default function App() {
  const [booting, setBooting] = useState(true)
  const [currentUser, setCurrentUser] = useState(null)
  const [jobs, setJobs] = useState([])
  const [customers, setCustomers] = useState([])
  const [customerIdsWithJobs, setCustomerIdsWithJobs] = useState(new Set())
  const [allUsers, setAllUsers] = useState([])
  const [accessCode, setAccessCode] = useState('')
  const [commissionRate, setCommissionRate] = useState(500)
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
    await refreshCustomers()
    if (profile.role === 'admin') {
      await refreshUsers()
      await refreshAppSettings()
    } else {
      await refreshCommissionRate()
    }
    setBooting(false)
  }

  async function refreshCommissionRate() {
    const { data, error } = await supabase.rpc('get_commission_rate')
    if (error) return
    setCommissionRate(Number(data) || 500)
  }

  async function refreshJobs() {
    const { data, error } = await supabase.from('jobs').select('*')
    if (error) { showToast('Failed to load job cards.', 'error'); return }
    setJobs((data || []).map(mapJob))
    await refreshCustomerIdsWithJobs()
  }

  async function refreshCustomers() {
    const { data, error } = await supabase.from('customers').select('*')
    if (error) return
    setCustomers((data || []).map(mapCustomer))
  }

  async function refreshCustomerIdsWithJobs() {
    const { data, error } = await supabase.rpc('customers_with_jobs')
    if (error) return
    setCustomerIdsWithJobs(new Set((data || []).map((r) => r.customer_id)))
  }

  async function refreshUsers() {
    const { data, error } = await supabase.from('profiles').select('*')
    if (error) return
    setAllUsers((data || []).map(mapProfile))
  }

  async function refreshAppSettings() {
    const { data, error } = await supabase.from('app_settings').select('signup_access_code, commission_per_customer').eq('id', true).single()
    if (error) return
    setAccessCode(data?.signup_access_code || '')
    setCommissionRate(Number(data?.commission_per_customer) || 500)
  }

  async function handleUpdateAccessCode(newCode) {
    const { error } = await supabase.from('app_settings').update({ signup_access_code: newCode }).eq('id', true)
    if (error) { showToast('Failed to update access code.', 'error'); return }
    showToast('Access code updated.')
    await refreshAppSettings()
  }

  async function handleUpdateCommissionRate(newRate) {
    const { error } = await supabase.from('app_settings').update({ commission_per_customer: newRate }).eq('id', true)
    if (error) { showToast('Failed to update commission rate.', 'error'); return }
    showToast('Commission rate updated.')
    await refreshAppSettings()
  }

  async function handleClearCommission(member) {
    const { error } = await supabase.from('customers').update({ commission_paid_at: new Date().toISOString() })
      .eq('recorded_by', member.id).is('commission_paid_at', null)
    if (error) { showToast('Failed to clear commission.', 'error'); return }
    showToast(`Cleared ${member.fullName}'s commission — marked as paid.`)
    await refreshCustomers()
  }

  // Customer status is no longer independently editable -- it's derived
  // from the linked job's status (see AdminDashboard), so there's nothing
  // to update here anymore.

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
      const { data: codeOk, error: codeCheckErr } = await supabase.rpc('check_access_code', { candidate: form.accessCode.trim() })
      if (!codeCheckErr && codeOk === false) {
        setAuthError('That access code is incorrect. Ask an admin for the current one.')
        return
      }
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
            department: form.department,
          },
        },
      })
      if (error) {
        const msg = (error.message || '').toLowerCase()
        if (msg.includes('invalid_access_code')) setAuthError('That access code is incorrect. Ask an admin for the current one.')
        else if (msg.includes('username')) setAuthError('That username is already taken. Please choose another.')
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

  // Admin creating a brand-new job and handing it to a technician (a
  // reported or raised issue), rather than a member filing their own.
  async function handleAssignJob(formData) {
    const { error } = await supabase.from('jobs').insert({
      ...jobToDbFields(formData),
      member_id: formData.assignedTo,
      assigned_by: currentUserRef.current.id,
      raised_by: formData.raisedBy || null,
      customer_id: formData.customerId || null,
    })
    if (error) { showToast('Failed to assign job.', 'error'); return }
    showToast('Job assigned.')
    await refreshJobs()
  }

  // For a job a member filed themselves (or that was auto-created from a
  // customer's desired date) — admin can hand it to a technician, but
  // can't touch any of its other details.
  // Note: reassigning a self-filed job (the "reassignOnly" flow in
  // JobFormModal) goes through handleUpdateJob below, not a separate
  // function -- its assignedTo branch already handles setting member_id
  // and assigned_by correctly.

  async function handleAddCustomer(formData) {
    const { data: inserted, error } = await supabase.from('customers')
      .insert({ ...customerToDbFields(formData), recorded_by: currentUserRef.current.id })
      .select().single()
    if (error) { showToast('Failed to save customer.', 'error'); return }

    const earnsCommission = COMMISSION_DEPARTMENTS.includes(currentUserRef.current.department)
    let message = earnsCommission ? `Customer recorded — KSh ${commissionRate} commission added.` : 'Customer recorded.'

    // A desired service date turns into a real, tracked job automatically —
    // not just a note that relies on someone remembering to act on it.
    if (formData.desiredDate) {
      const { error: jobError } = await supabase.from('jobs').insert({
        job_type: 'New Installation',
        location: formData.location,
        requested_by: `${formData.firstName} ${formData.lastName}`,
        requester_contact: formData.contact,
        visit_date: formData.desiredDate,
        transport_from: 'Office',
        transport_to: [formData.location],
        transport_amount: 0,
        status: 'Pending',
        priority: 'Normal',
        notes: `Follow-up for potential customer.${formData.notes ? ' ' + formData.notes : ''} Interested in ${formData.interestedPackage || 'a package (not yet specified)'}.`,
        member_id: currentUserRef.current.id,
        customer_id: inserted.id,
      })
      if (!jobError) message += ` A follow-up job was scheduled for ${formData.desiredDate}.`
      await refreshJobs()
    }

    showToast(message)
    await refreshCustomers()
  }

  async function handleUpdateCustomer(id, formData) {
    const { error } = await supabase.from('customers').update(customerToDbFields(formData)).eq('id', id)
    if (error) { showToast('Failed to update customer.', 'error'); return }
    showToast('Customer updated.')
    await refreshCustomers()
  }

  async function handleDeleteCustomer(id) {
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) { showToast('Failed to delete customer.', 'error'); return }
    showToast('Customer deleted.')
    await refreshCustomers()
  }

  async function handleUpdateJob(id, formData) {
    // Reassign-only sends just { assignedTo } — nothing else about the job
    // changed, so don't run it through the full field mapper (which would
    // otherwise build an update full of undefined values for every other
    // column).
    const isReassignOnly = formData.assignedTo && Object.keys(formData).length === 1
    const updates = isReassignOnly ? {} : jobToDbFields(formData)
    if (formData.assignedTo) {
      updates.member_id = formData.assignedTo
      if (currentUserRef.current.role === 'admin') updates.assigned_by = currentUserRef.current.id
    }
    if (formData.raisedBy) updates.raised_by = formData.raisedBy
    const { error } = await supabase.from('jobs').update(updates).eq('id', id)
    if (error) { showToast('Failed to update job card.', 'error'); return }
    showToast(isReassignOnly ? 'Job reassigned.' : 'Job card updated.')
    await refreshJobs()
  }

  async function handleUpdateProfile(profileId, updates) {
    const { error } = await supabase.from('profiles').update(updates).eq('id', profileId)
    if (error) { showToast('Failed to update profile.', 'error'); return }
    showToast('Profile updated.')
    if (profileId === currentUserRef.current.id) {
      const { data } = await supabase.from('profiles').select('*').eq('id', profileId).single()
      if (data) { const updated = mapProfile(data); currentUserRef.current = updated; setCurrentUser(updated) }
    }
    if (currentUserRef.current.role === 'admin') await refreshUsers()
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

  async function handleUpdateDepartment(member, department) {
    const { error } = await supabase.from('profiles').update({ department }).eq('id', member.id)
    if (error) { showToast('Failed to update department.', 'error'); return }
    showToast(`${member.fullName}'s department updated.`)
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
      ? <AdminDashboard currentUser={currentUser} users={allUsers} jobs={jobs} customers={customers} onLogout={handleLogout} onUpdateJob={handleUpdateJob} onDeleteJob={handleDeleteJob} onAssignJob={handleAssignJob} onPromote={handlePromote} onUpdateDepartment={handleUpdateDepartment} onUpdateProfile={handleUpdateProfile} accessCode={accessCode} onUpdateAccessCode={handleUpdateAccessCode} commissionRate={commissionRate} onUpdateCommissionRate={handleUpdateCommissionRate} onClearCommission={handleClearCommission} onUpdateCustomer={handleUpdateCustomer} onDeleteCustomer={handleDeleteCustomer} />
      : <MemberDashboard currentUser={currentUser} jobs={jobs.filter((j) => j.memberId === currentUser.id)} customers={customers} customerIdsWithJobs={customerIdsWithJobs} onLogout={handleLogout} onAddJob={handleAddJob} onUpdateJob={handleUpdateJob} onDeleteJob={handleDeleteJob} onAddCustomer={handleAddCustomer} onUpdateCustomer={handleUpdateCustomer} onDeleteCustomer={handleDeleteCustomer} onUpdateProfile={handleUpdateProfile} commissionRate={commissionRate} />}
  </>)
}
