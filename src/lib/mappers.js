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
    createdAt: row.created_at,
  }
}

export function mapJob(row) {
  return {
    id: row.id,
    jobId: row.job_code,
    jobType: row.job_type,
    location: row.location,
    requestedBy: row.requested_by,
    requesterContact: row.requester_contact || '',
    visitDate: row.visit_date,
    transportAmount: Number(row.transport_amount) || 0,
    status: row.status,
    notes: row.notes || '',
    memberId: row.member_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function jobToDbFields(data) {
  return {
    job_type: data.jobType,
    location: data.location,
    requested_by: data.requestedBy,
    requester_contact: data.requesterContact || null,
    visit_date: data.visitDate,
    transport_amount: data.transportAmount,
    status: data.status,
    notes: data.notes || null,
  }
}
