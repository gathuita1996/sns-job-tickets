// Supabase rows are snake_case; the app's components use the same camelCase
// field names as the original artifact (jobId, jobType, requestedBy, ...).
// Keeping that mapping in one place means the rest of the app barely
// changed when the storage layer moved from window.storage to Postgres.

export function mapProfile(row) {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    contact: row.contact,
    email: row.email || '',
    role: row.role,
    title: row.title || '',
    department: row.department || 'technical',
    isTeamLead: Boolean(row.is_team_lead),
    isDirector: Boolean(row.is_director),
    gender: row.gender || '',
    dateOfBirth: row.date_of_birth || '',
    idNumber: row.id_number || '',
    kraPin: row.kra_pin || '',
    shaNumber: row.sha_number || '',
    createdAt: row.created_at,
  }
}

export function mapCustomer(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name} ${row.last_name}`,
    contact: row.contact,
    location: row.location,
    interestedPackage: row.interested_package || '',
    notes: row.notes || '',
    status: row.status || 'New',
    desiredDate: row.desired_date || '',
    commissionPaidAt: row.commission_paid_at,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
  }
}

export function customerToDbFields(data) {
  return {
    first_name: data.firstName,
    last_name: data.lastName,
    contact: data.contact,
    location: data.location,
    interested_package: data.interestedPackage || null,
    notes: data.notes || null,
    desired_date: data.desiredDate || null,
  }
}

export function mapJob(row) {
  return {
    id: row.id,
    jobId: row.job_code,
    jobType: row.job_type,
    jobTypeOther: row.job_type_other || '',
    location: row.location,
    requestedBy: row.requested_by || '',
    requesterContact: row.requester_contact || '',
    visitDate: row.visit_date,
    transportFrom: row.transport_from || '',
    transportTo: row.transport_to || [],
    transportAmount: Number(row.transport_amount) || 0,
    status: row.status,
    priority: row.priority || 'Normal',
    notes: row.notes || '',
    overdueReason: row.overdue_reason || '',
    memberId: row.member_id,
    assignedBy: row.assigned_by || null,
    raisedBy: row.raised_by || null,
    customerId: row.customer_id || null,
    coTechnicians: row.co_technicians || [],
    transportPaidAt: row.transport_paid_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function jobToDbFields(data) {
  return {
    job_type: data.jobType,
    job_type_other: data.jobType === 'Other' ? (data.jobTypeOther || null) : null,
    location: data.location,
    requested_by: data.requestedBy?.trim() || null,
    requester_contact: data.requesterContact || null,
    visit_date: data.visitDate,
    transport_from: data.transportFrom,
    transport_to: data.transportTo,
    transport_amount: data.transportAmount,
    status: data.status,
    priority: data.priority || 'Normal',
    notes: data.notes || null,
    overdue_reason: data.overdueReason || null,
    customer_id: data.customerId || null,
    co_technicians: data.coTechnicians && data.coTechnicians.length ? data.coTechnicians : null,
  }
}

export function mapComplaint(row) {
  return {
    id: row.id,
    complainantName: row.complainant_name,
    location: row.location,
    contact: row.contact,
    complaintType: row.complaint_type,
    complaintTypeOther: row.complaint_type_other || '',
    details: row.details,
    isRecurring: row.is_recurring,
    status: row.status,
    resolutionNotes: row.resolution_notes || '',
    raisedBy: row.raised_by,
    resolvedBy: row.resolved_by || null,
    resolvedAt: row.resolved_at || null,
    createdAt: row.created_at,
  }
}

export function complaintToDbFields(data) {
  return {
    complainant_name: data.complainantName,
    location: data.location,
    contact: data.contact,
    complaint_type: data.complaintType,
    complaint_type_other: data.complaintType === 'Other' ? (data.complaintTypeOther || null) : null,
    details: data.details,
    is_recurring: Boolean(data.isRecurring),
  }
}

export function mapExpense(row) {
  return {
    id: row.id,
    description: row.description,
    amount: Number(row.amount) || 0,
    category: row.category,
    entryType: row.entry_type || 'purchase',
    providerName: row.provider_name || '',
    providerContact: row.provider_contact || '',
    purchaseDate: row.purchase_date || null,
    receiptPath: row.receipt_path || null,
    receiptUploadedAt: row.receipt_uploaded_at || null,
    status: row.status,
    adminNotes: row.admin_notes || '',
    submittedBy: row.submitted_by,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    paidAt: row.paid_at || null,
    createdAt: row.created_at,
  }
}

// Only the request-stage fields -- attaching a receipt later goes through
// its own update, not this mapper, since it's a different action on an
// existing row rather than a new insert.
export function expenseToDbFields(data) {
  return {
    description: data.description,
    amount: Number(data.amount),
    category: data.category,
    entry_type: 'purchase',
  }
}

// A Service is known in full at submission time (who did it, when, for how
// much) -- unlike a Purchase, there's no later "attach receipt" step, so
// purchase_date is set right away here, not left for a later action.
export function serviceToDbFields(data) {
  return {
    description: data.description,
    amount: Number(data.amount),
    entry_type: 'service',
    provider_name: data.providerName,
    provider_contact: data.providerContact,
    purchase_date: data.serviceDate,
  }
}
