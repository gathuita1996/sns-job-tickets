// Talking to the app's own database (Supabase) from the server. Two kinds of calls:
//   * as the person who is signed in (their login token), so the database's own rules decide what they may read, and
//   * with the service key, which only the server holds, for writing the message log.
// Every call returns { ok, status, data } instead of throwing; `unreachable` is set when the database could not be reached.

// Supabase's new keys (sb_publishable_..., sb_secret_...) go in the apikey header only; the older JWT keys go in both.
export function keyHeaders(key) {
  return /^sb_(publishable|secret)_/.test(key) ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` }
}

export function supabaseApi({ url, anonKey, serviceKey, fetch }) {
  async function call(target, init) {
    try {
      const res = await fetch(target, init)
      const text = await res.text()
      let data = null
      try { data = text ? JSON.parse(text) : null } catch { /* not JSON */ }
      return { ok: res.ok, status: res.status, data }
    } catch (error) {
      return { ok: false, status: 0, data: null, unreachable: true, error: String((error && error.message) || error) }
    }
  }
  const asUser = (jwt) => ({ apikey: anonKey, Authorization: `Bearer ${jwt}` })
  const json = { 'Content-Type': 'application/json' }

  return {
    // who is signed in -> { user: { id } } | { user: null } | { unreachable: true }
    async getUser(jwt) {
      const r = await call(`${url}/auth/v1/user`, { headers: asUser(jwt) })
      if (r.unreachable || r.status >= 500) return { unreachable: true }
      return { user: r.ok && r.data && r.data.id ? { id: String(r.data.id) } : null }
    },
    // true / false / null (the database could not say)
    async isAdmin(jwt) {
      const r = await call(`${url}/rest/v1/rpc/is_admin`, { method: 'POST', headers: { ...asUser(jwt), ...json }, body: '{}' })
      return r.ok && typeof r.data === 'boolean' ? r.data : null
    },
    // a read as the signed-in person: the database's rules apply
    userGet: (jwt, path) => call(`${url}/rest/v1/${path}`, { headers: { ...asUser(jwt), Accept: 'application/json' } }),
    // the server's own calls
    serviceRpc: (name, args) => call(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { ...keyHeaders(serviceKey), ...json }, body: JSON.stringify(args || {}) }),
    serviceGet: (path) => call(`${url}/rest/v1/${path}`, { headers: { ...keyHeaders(serviceKey), Accept: 'application/json' } }),
    // a receipt PDF kept in the (public) receipts folder -> { ok, bytes } | { ok: false }
    async publicFile(path) {
      try {
        const res = await fetch(`${url}/storage/v1/object/public/customer-receipts/${path}`)
        if (!res.ok) return { ok: false, status: res.status }
        const bytes = new Uint8Array(await res.arrayBuffer())
        return { ok: true, bytes }
      } catch (error) {
        return { ok: false, status: 0, unreachable: true }
      }
    },
  }
}
