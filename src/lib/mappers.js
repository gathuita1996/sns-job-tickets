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
    role: row.role,
    title: row.title || '',
    department: row.department || 'technical',
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
    transportTo: row.transport_to || '',
    transportAmount: Number(row.transport_amount) || 0,
    status: row.status,
    priority: row.priority || 'Normal',
    notes: row.notes || '',
    overdueReason: row.overdue_reason || '',
    memberId: row.member_id,
    assignedBy: row.assigned_by || null,
    raisedBy: row.raised_by || null,
    customerId: row.customer_id || null,
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
  }
}
