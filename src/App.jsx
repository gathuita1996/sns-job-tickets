import { useEffect, useRef, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { mapProfile, mapJob, jobToDbFields, mapCustomer, customerToDbFields, mapComplaint, complaintToDbFields, mapExpense, expenseToDbFields, serviceToDbFields, mapStockItem, stockItemToDbFields, mapStockIn, stockInToDbFields, mapStockOut, stockOutToDbFields } from './lib/mappers'
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
  const [complaints, setComplaints] = useState([])
  const [expenses, setExpenses] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [stockIn, setStockIn] = useState([])
  const [stockOut, setStockOut] = useState([])
  const [memberNames, setMemberNames] = useState({})
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
    await refreshExpenses()
    if (profile.role === 'admin') {
      await refreshUsers()
      await refreshAppSettings()
      await refreshStockItems()
      await refreshStockIn()
      await refreshStockOut()
    } else {
      await refreshCommissionRate()
    }
    if (profile.role === 'admin' || profile.department === 'technical') {
      await refreshComplaints()
      if (profile.role !== 'admin') await refreshMemberNames()
    }
    setBooting(false)
  }

  async function refreshComplaints() {
    const { data, error } = await supabase.from('complaints').select('*')
    if (error) return
    setComplaints((data || []).map(mapComplaint))
  }

  // Unlike complaints, this needs no role/department check -- RLS already
  // scopes it correctly for everyone (admin sees all, a member sees only
  // their own submissions), same as customers already works.
  async function refreshExpenses() {
    const { data, error } = await supabase.from('expenses').select('*')
    if (error) return
    setExpenses((data || []).map(mapExpense))
  }

  async function refreshStockItems() {
    const { data, error } = await supabase.from('stock_items').select('*').order('item_name')
    if (error) return
    setStockItems((data || []).map(mapStockItem))
  }

  async function refreshStockIn() {
    const { data, error } = await supabase.from('stock_in').select('*')
    if (error) return
    setStockIn((data || []).map(mapStockIn))
  }

  async function refreshStockOut() {
    const { data, error } = await supabase.from('stock_out').select('*')
    if (error) return
    setStockOut((data || []).map(mapStockOut))
  }

  async function refreshMemberNames() {
    const { data, error } = await supabase.rpc('member_names')
    if (error) return
    const map = {}
    ;(data || []).forEach((row) => { map[row.id] = { fullName: row.full_name, department: row.department } })
    setMemberNames(map)
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

  // Admin creating a brand-new job and handing it to a Technical or Sales &
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
  // customer's desired date) — admin can hand it to someone else, but
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
        raised_by: currentUserRef.current.id,
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

  async function handleAddComplaint(formData) {
    const { error } = await supabase.from('complaints').insert({ ...complaintToDbFields(formData), raised_by: currentUserRef.current.id })
    if (error) { showToast('Failed to save complaint.', 'error'); return }
    showToast('Complaint reported.')
    // Only admins and Technical members can actually see the queue -- for
    // everyone else (Sales raising one) there's nothing to refresh.
    if (currentUserRef.current.role === 'admin' || currentUserRef.current.department === 'technical') {
      await refreshComplaints()
    }
  }

  async function handleUpdateComplaintStatus(complaint, status) {
    const { error } = await supabase.from('complaints').update({ status }).eq('id', complaint.id)
    if (error) { showToast('Failed to update complaint.', 'error'); return }
    await refreshComplaints()
  }

  async function handleResolveComplaint(complaint, resolutionNotes) {
    const { error } = await supabase.from('complaints').update({
      status: 'Resolved',
      resolution_notes: resolutionNotes.trim() || null,
      resolved_by: currentUserRef.current.id,
      resolved_at: new Date().toISOString(),
    }).eq('id', complaint.id)
    if (error) { showToast('Failed to resolve complaint.', 'error'); return }
    showToast('Complaint resolved.')
    await refreshComplaints()
  }

  // Marks every one of a member's jobs within the given day range as paid
  // in one go -- a batch update, not one job at a time, since that's how
  // transport actually gets settled (the whole day's total, at once).
  async function handleMarkTransportPaid(member, dayStart, dayEnd) {
    const { error } = await supabase.from('jobs').update({ transport_paid_at: new Date().toISOString() })
      .eq('member_id', member.id)
      .is('transport_paid_at', null)
      .gte('created_at', dayStart.toISOString())
      .lt('created_at', dayEnd.toISOString())
    if (error) { showToast('Failed to mark transport as paid.', 'error'); return }
    showToast(`Marked ${member.fullName}'s transport as paid.`)
    await refreshJobs()
  }

  async function handleAddExpense(formData) {
    const { error } = await supabase.from('expenses').insert({
      ...expenseToDbFields(formData),
      submitted_by: currentUserRef.current.id,
    })
    if (error) { showToast('Failed to submit request.', 'error'); return }
    showToast('Purchase request submitted for approval.')
    await refreshExpenses()
  }

  // Admin-only, per RLS -- the provider isn't SNS staff, so there's no
  // Team Lead check to make here the way there is for a Purchase.
  async function handleAddService(formData) {
    const { error } = await supabase.from('expenses').insert({
      ...serviceToDbFields(formData),
      submitted_by: currentUserRef.current.id,
    })
    if (error) { showToast('Failed to submit service request.', 'error'); return }
    showToast('Service request submitted for approval.')
    await refreshExpenses()
  }

  // The one thing a submitter can do to their own row: once it's Approved,
  // attach the receipt and move it to Purchased. RLS backs this up with
  // its own narrow rule -- this can't accidentally jump straight to Paid
  // or touch a row that isn't Approved and isn't theirs.
  async function handleAttachReceipt(expense, formData) {
    const filePath = `${currentUserRef.current.id}/${Date.now()}-${formData.receiptFile.name}`
    const { error: uploadError } = await supabase.storage.from('receipts').upload(filePath, formData.receiptFile)
    if (uploadError) { showToast('Failed to upload receipt.', 'error'); return }

    const { error } = await supabase.from('expenses').update({
      amount: Number(formData.amount),
      purchase_date: formData.purchaseDate,
      receipt_path: filePath,
      receipt_uploaded_at: new Date().toISOString(),
      status: 'Purchased',
    }).eq('id', expense.id)
    if (error) { showToast('Failed to save receipt.', 'error'); return }
    showToast('Receipt attached — awaiting payment.')
    await refreshExpenses()
  }

  // payNow reflects the Director's choice between "Approve and Pay" (money
  // moves right away) and "Approve" alone (pay later, once there's proof
  // of purchase). For a Service -- which never goes through the
  // attach-receipt step -- approving with payNow has nothing left to wait
  // for, so it goes straight to Paid instead of sitting at Approved.
  async function handleApproveExpense(expense, payNow) {
    const isServicePaidNow = expense.entryType === 'service' && payNow
    const { error } = await supabase.from('expenses').update({
      status: isServicePaidNow ? 'Paid' : 'Approved',
      reviewed_by: currentUserRef.current.id,
      reviewed_at: new Date().toISOString(),
      admin_notes: null,
      paid_at: payNow ? new Date().toISOString() : null,
    }).eq('id', expense.id)
    if (error) { showToast('Failed to approve expense.', 'error'); return }
    showToast(payNow ? 'Approved and marked as paid.' : 'Approved — pay once purchased.')
    await refreshExpenses()
  }

  async function handleRejectExpense(expense, notes) {
    const { error } = await supabase.from('expenses').update({
      status: 'Rejected', reviewed_by: currentUserRef.current.id, reviewed_at: new Date().toISOString(), admin_notes: notes?.trim() || null,
    }).eq('id', expense.id)
    if (error) { showToast('Failed to reject expense.', 'error'); return }
    showToast('Expense rejected.')
    await refreshExpenses()
  }

  async function handleMarkExpensePaid(expense) {
    const { error } = await supabase.from('expenses').update({ status: 'Paid', paid_at: new Date().toISOString() }).eq('id', expense.id)
    if (error) { showToast('Failed to mark expense as paid.', 'error'); return }
    showToast('Expense marked as paid.')
    await refreshExpenses()
  }

  async function handleDeleteExpense(expense) {
    const { error } = await supabase.from('expenses').delete().eq('id', expense.id)
    if (error) { showToast('Failed to delete expense.', 'error'); return }
    showToast('Expense deleted.')
    await refreshExpenses()
  }

  async function handleAddStockItem(formData) {
    const { error } = await supabase.from('stock_items').insert(stockItemToDbFields(formData))
    if (error) { showToast(error.code === '23505' ? 'That item code is already in use.' : 'Failed to add item.', 'error'); return }
    showToast('Item added to catalog.')
    await refreshStockItems()
  }

  async function handleUpdateStockItem(id, formData) {
    const { error } = await supabase.from('stock_items').update(stockItemToDbFields(formData)).eq('id', id)
    if (error) { showToast(error.code === '23505' ? 'That item code is already in use.' : 'Failed to update item.', 'error'); return }
    showToast('Item updated.')
    await refreshStockItems()
  }

  async function handleDeleteStockItem(item) {
    const { error } = await supabase.from('stock_items').delete().eq('id', item.id)
    if (error) { showToast('Failed to delete — this item has stock history recorded against it.', 'error'); return }
    showToast('Item deleted.')
    await refreshStockItems()
  }

  async function handleAddStockIn(formData) {
    const { error } = await supabase.from('stock_in').insert({ ...stockInToDbFields(formData), recorded_by: currentUserRef.current.id })
    if (error) { showToast('Failed to record purchase.', 'error'); return }
    showToast('Stock in recorded.')
    await refreshStockIn()
  }

  async function handleAddStockOut(formData) {
    const { error } = await supabase.from('stock_out').insert({ ...stockOutToDbFields(formData), recorded_by: currentUserRef.current.id })
    if (error) { showToast('Failed to record issue.', 'error'); return }
    showToast('Stock out recorded.')
    await refreshStockOut()
  }

  // The receipts bucket is private, so viewing one needs a temporary signed
  // link generated on demand -- not a permanent public URL. Returns the
  // URL rather than opening it; the inline viewer (ExpensesList) displays
  // it directly on the page, not in a new tab.
  async function getReceiptUrl(receiptPath) {
    const { data, error } = await supabase.storage.from('receipts').createSignedUrl(receiptPath, 3600)
    if (error) { showToast('Failed to load receipt.', 'error'); return null }
    return data.signedUrl
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

  async function handleToggleTeamLead(member) {
    const { error } = await supabase.from('profiles').update({ is_team_lead: !member.isTeamLead }).eq('id', member.id)
    if (error) { showToast('Failed to update team lead status.', 'error'); return }
    showToast(member.isTeamLead ? `${member.fullName} is no longer a team lead.` : `${member.fullName} is now a team lead.`)
    await refreshUsers()
  }

  // Only one Director at a time -- clear whoever currently holds it before
  // setting the new one, so this never leaves two people with the flag.
  async function handleSetDirector(member) {
    const { error: clearError } = await supabase.from('profiles').update({ is_director: false }).eq('is_director', true)
    if (clearError) { showToast('Failed to update director. Please try again.', 'error'); return }
    const { error } = await supabase.from('profiles').update({ is_director: true }).eq('id', member.id)
    if (error) { showToast('Failed to update director. Please try again.', 'error'); return }
    showToast(`${member.fullName} is now the Director.`)
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
      ? <AdminDashboard currentUser={currentUser} users={allUsers} jobs={jobs} customers={customers} complaints={complaints} expenses={expenses} stockItems={stockItems} stockIn={stockIn} stockOut={stockOut} onLogout={handleLogout} onAddJob={handleAddJob} onUpdateJob={handleUpdateJob} onDeleteJob={handleDeleteJob} onAssignJob={handleAssignJob} onPromote={handlePromote} onUpdateDepartment={handleUpdateDepartment} onUpdateProfile={handleUpdateProfile} accessCode={accessCode} onUpdateAccessCode={handleUpdateAccessCode} commissionRate={commissionRate} onUpdateCommissionRate={handleUpdateCommissionRate} onClearCommission={handleClearCommission} onUpdateCustomer={handleUpdateCustomer} onDeleteCustomer={handleDeleteCustomer} onUpdateComplaintStatus={handleUpdateComplaintStatus} onResolveComplaint={handleResolveComplaint} onMarkTransportPaid={handleMarkTransportPaid} onAddExpense={handleAddExpense} onAddService={handleAddService} onAttachReceipt={handleAttachReceipt} onApproveExpense={handleApproveExpense} onRejectExpense={handleRejectExpense} onMarkExpensePaid={handleMarkExpensePaid} onDeleteExpense={handleDeleteExpense} onViewReceipt={getReceiptUrl} onToggleTeamLead={handleToggleTeamLead} onSetDirector={handleSetDirector} onAddStockItem={handleAddStockItem} onUpdateStockItem={handleUpdateStockItem} onDeleteStockItem={handleDeleteStockItem} onAddStockIn={handleAddStockIn} onAddStockOut={handleAddStockOut} />
      : <MemberDashboard currentUser={currentUser} jobs={jobs.filter((j) => j.memberId === currentUser.id)} raisedJobs={jobs.filter((j) => j.raisedBy === currentUser.id && j.memberId !== currentUser.id)} customers={customers} customerIdsWithJobs={customerIdsWithJobs} complaints={complaints} expenses={expenses.filter((e) => e.submittedBy === currentUser.id)} memberNames={memberNames} onLogout={handleLogout} onAddJob={handleAddJob} onUpdateJob={handleUpdateJob} onDeleteJob={handleDeleteJob} onAddCustomer={handleAddCustomer} onUpdateCustomer={handleUpdateCustomer} onDeleteCustomer={handleDeleteCustomer} onUpdateProfile={handleUpdateProfile} onAddComplaint={handleAddComplaint} onUpdateComplaintStatus={handleUpdateComplaintStatus} onResolveComplaint={handleResolveComplaint} onAddExpense={handleAddExpense} onAttachReceipt={handleAttachReceipt} onDeleteExpense={handleDeleteExpense} onViewReceipt={getReceiptUrl} commissionRate={commissionRate} />}
  </>)
}
