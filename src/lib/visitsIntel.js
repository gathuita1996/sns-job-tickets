// Field-visit intelligence for the Sales & Marketing team.
// Pure functions (no React, no Supabase) so the logic can be tested on its own.
// Dates are 'YYYY-MM-DD' strings throughout.

export const PURPOSES = [
  { key: 'marketing', label: 'Marketing' },
  { key: 'site_survey', label: 'Site survey' },
  { key: 'both', label: 'Marketing + survey' },
]

// followUpDays = the follow-up date suggested automatically when this outcome is picked.
export const OUTCOMES = [
  { key: 'interested', label: 'Interested', tone: 'good', followUpDays: 7 },
  { key: 'follow_up', label: 'Follow-up needed', tone: 'warn', followUpDays: 7 },
  { key: 'no_one_available', label: 'No one available', tone: 'warn', followUpDays: 3 },
  { key: 'survey_done', label: 'Survey done', tone: 'info', followUpDays: 14 },
  { key: 'converted', label: 'Became a customer', tone: 'good', followUpDays: null },
  { key: 'not_interested', label: 'Not interested', tone: 'bad', followUpDays: null },
  { key: 'other', label: 'Other', tone: 'neutral', followUpDays: null },
]

export const PLACE_CATEGORIES = [
  { key: 'estate', label: 'Estate / apartments' },
  { key: 'hotel', label: 'Hotel / resort' },
  { key: 'school', label: 'School / institution' },
  { key: 'business', label: 'Business / shop' },
  { key: 'village', label: 'Village / homesteads' },
  { key: 'market', label: 'Market / trading centre' },
  { key: 'other', label: 'Other' },
]

// The thresholds behind the suggestions. Shown to the user so nothing feels like a black box.
export const RULES = {
  interestedDays: 7,        // "interested" and nobody went back for a week
  followUpDays: 7,          // "follow-up needed" and nobody went back for a week
  noOneDays: 3,             // nobody was in -- try again after 3 days
  surveyCheckDays: 14,      // survey done but no decision recorded after 2 weeks
  staleDays: 45,            // not visited for 45 days (unless converted / not interested)
  recheckNotInterestedDays: 90,
}

export const labelOf = (list, key) => (list.find((x) => x.key === key) || {}).label || key || '—'

// ---- dates ------------------------------------------------------------------------------------
export function dayNumber(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}
export const daysBetween = (from, to) => dayNumber(to) - dayNumber(from)
export function addDays(s, n) {
  return new Date((dayNumber(s) + n) * 86400000).toISOString().slice(0, 10)
}
export function relativeDays(n) {
  if (n == null) return '—'
  if (n <= 0) return 'today'
  if (n === 1) return 'yesterday'
  if (n < 14) return `${n} days ago`
  if (n < 60) return `${Math.round(n / 7)} weeks ago`
  return `${Math.round(n / 30)} months ago`
}
export function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const CLOSED = ['converted', 'not_interested']

// ---- the analysis ---------------------------------------------------------------------------------
// For every active place: how often it was visited, what happened last, and whether it
// needs a first visit or a return visit -- with a priority score and the reasons in words.
export function analyzePlaces({ places, visits, customers = [], today }) {
  const byPlace = new Map()
  for (const v of visits) {
    if (!byPlace.has(v.placeId)) byPlace.set(v.placeId, [])
    byPlace.get(v.placeId).push(v)
  }
  const customerPlaces = customers.map((c) => normalize(c.location))

  return places.filter((p) => p.active !== false).map((place) => {
    const vs = (byPlace.get(place.id) || []).slice().sort((a, b) =>
      String(a.visitDate).localeCompare(String(b.visitDate)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || (a.id - b.id))
    const last = vs[vs.length - 1] || null
    const key = normalize(place.name)
    const customersNearby = key.length >= 3 ? customerPlaces.filter((l) => l.includes(key)).length : 0
    const leadsTotal = vs.reduce((s, v) => s + (Number(v.leads) || 0), 0)
    const conversions = vs.filter((v) => v.outcome === 'converted').length
    const reasons = []
    let score = 0, needRevisit = false

    if (!last) {
      const age = place.createdAt ? Math.max(daysBetween(String(place.createdAt).slice(0, 10), today), 0) : 0
      score = 20 + Math.min(customersNearby * 5, 30)
        + (['hotel', 'estate', 'school', 'business'].includes(place.category) ? 8 : 0) + Math.min(age * 0.2, 10)
      reasons.push(customersNearby > 0
        ? `${plural(customersNearby, 'customer')} already here -- neighbours are likely to want service`
        : 'On your list and not visited yet')
    } else {
      const daysSince = daysBetween(last.visitDate, today)
      const followUpGap = last.followUpDate ? daysBetween(last.followUpDate, today) : null   // >= 0 means due or overdue
      const open = !CLOSED.includes(last.outcome)

      if (open && followUpGap != null && followUpGap >= 0) {
        needRevisit = true; score += 60 + Math.min(followUpGap, 30)
        reasons.push(followUpGap === 0 ? 'Follow-up is due today' : `Follow-up was due ${plural(followUpGap, 'day')} ago`)
      }
      if (last.outcome === 'interested' && daysSince >= RULES.interestedDays) {
        needRevisit = true; score += 30; reasons.push(`Showed interest ${plural(daysSince, 'day')} ago -- nobody has been back`)
      }
      if (last.outcome === 'follow_up' && daysSince >= RULES.followUpDays) {
        needRevisit = true; score += 25; reasons.push(`Asked for a follow-up ${plural(daysSince, 'day')} ago`)
      }
      if (last.outcome === 'no_one_available' && daysSince >= RULES.noOneDays) {
        needRevisit = true; score += 20; reasons.push('Nobody was available last time')
      }
      if (last.outcome === 'survey_done' && daysSince >= RULES.surveyCheckDays) {
        needRevisit = true; score += 15; reasons.push(`Survey done ${plural(daysSince, 'day')} ago -- check the decision`)
      }
      if (open && daysSince >= RULES.staleDays) {
        needRevisit = true; score += 10; reasons.push(`Not visited for ${plural(daysSince, 'day')}`)
      }
      if (needRevisit) {
        // the more time has passed, the more leads were found and the more customers live nearby, the sooner
        score += Math.min(daysSince, 90) * 0.4 + Math.min(leadsTotal * 4, 20) + Math.min(customersNearby * 3, 15)
      } else if (last.outcome === 'not_interested' && daysSince >= RULES.recheckNotInterestedDays) {
        needRevisit = true; score = 5 + Math.min(customersNearby * 2, 6)
        reasons.push(`Said no ${plural(daysSince, 'day')} ago -- worth a fresh look`)
      }
    }

    const lastVisitDate = last ? last.visitDate : null
    return {
      place, visits: vs, visitCount: vs.length, lastVisit: last, lastVisitDate,
      daysSince: last ? daysBetween(last.visitDate, today) : null,
      lastOutcome: last ? last.outcome : null, followUpDate: last ? last.followUpDate || null : null,
      leadsTotal, conversions, customersNearby,
      status: last ? 'visited' : 'new', needVisit: !last, needRevisit,
      score: Math.round(score * 10) / 10, reasons: reasons.slice(0, 3),
      priority: score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low',
    }
  })
}

// Where to go next: first-visit targets and return visits mixed, highest priority first.
export function suggestions(stats, limit = 6) {
  return stats.filter((s) => s.needVisit || s.needRevisit)
    .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name))
    .slice(0, limit)
}

export function mostVisited(stats, n = 5) {
  return stats.filter((s) => s.visitCount > 0)
    .sort((a, b) => b.visitCount - a.visitCount || String(b.lastVisitDate).localeCompare(String(a.lastVisitDate)))
    .slice(0, n)
}

// Places grouped by area, so a day's trip can be planned in one direction.
export function routeByArea(items) {
  const groups = new Map()
  for (const s of items) {
    const area = (s.place.area || '').trim() || 'Other places'
    if (!groups.has(area)) groups.set(area, { area, items: [], total: 0 })
    const g = groups.get(area); g.items.push(s); g.total += s.score
  }
  return [...groups.values()].sort((a, b) => b.total - a.total)
}

// Where customers already live but nobody has recorded a place -- candidates to add.
export function uncoveredAreas({ places, customers, min = 1 }) {
  const known = places.flatMap((p) => [normalize(p.name), normalize(p.area)]).filter((k) => k.length >= 3)
  const groups = new Map()
  for (const c of customers) {
    const raw = String(c.location || '').trim(), key = normalize(raw)
    if (key.length < 3 || key === 'not specified') continue
    if (known.some((k) => key.includes(k) || k.includes(key))) continue
    const g = groups.get(key) || { count: 0, spellings: new Map() }
    g.count++; g.spellings.set(raw, (g.spellings.get(raw) || 0) + 1); groups.set(key, g)
  }
  return [...groups.values()].filter((g) => g.count >= min)
    .map((g) => ({ label: [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0], customers: g.count }))
    .sort((a, b) => b.customers - a.customers || a.label.localeCompare(b.label))
}

export function monthSummary(visits, today) {
  const prefix = String(today).slice(0, 7)
  const v = visits.filter((x) => String(x.visitDate).startsWith(prefix))
  return {
    visits: v.length, places: new Set(v.map((x) => x.placeId)).size,
    leads: v.reduce((s, x) => s + (Number(x.leads) || 0), 0),
    conversions: v.filter((x) => x.outcome === 'converted').length,
    surveys: v.filter((x) => x.purpose !== 'marketing').length,
  }
}

export function teamActivity(visits, today) {
  const prefix = String(today).slice(0, 7), by = new Map()
  for (const v of visits.filter((x) => String(x.visitDate).startsWith(prefix))) {
    const r = by.get(v.visitedBy) || { id: v.visitedBy, visits: 0, leads: 0, conversions: 0, places: new Set() }
    r.visits++; r.leads += Number(v.leads) || 0; if (v.outcome === 'converted') r.conversions++; r.places.add(v.placeId)
    by.set(v.visitedBy, r)
  }
  return [...by.values()].map((r) => ({ ...r, places: r.places.size })).sort((a, b) => b.visits - a.visits)
}
