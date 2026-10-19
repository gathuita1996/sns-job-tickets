import assert from 'node:assert/strict'
import { isValidCoordinate, formatCoords, mapsUrl, accuracyNote, describeGeoError, captureLocation } from '../src/lib/gps.js'
import { jobToDbFields, mapJob } from '../src/lib/mappers.js'
import { JOB_TYPES, SITE_SURVEY } from '../src/lib/helpers.js'
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('PASS', name) }
const fakeGeo = (outcome) => ({ getCurrentPosition: (success, fail) => (outcome.error ? fail(outcome.error) : success(outcome.pos)) })
const pos = (latitude, longitude, accuracy, timestamp = Date.UTC(2026, 9, 20, 8, 30)) => ({ coords: { latitude, longitude, accuracy }, timestamp })

await ok('"Site Survey" is a real job type, and the constant matches the list exactly', () => { assert.equal(SITE_SURVEY, 'Site Survey'); assert.ok(JOB_TYPES.includes(SITE_SURVEY)) })
await ok('coordinates are checked: real latitudes and longitudes only', () => {
  assert.ok(isValidCoordinate(-4.2849, 39.5897)); assert.ok(isValidCoordinate(0, 0)); assert.ok(isValidCoordinate(-90, 180))
  for (const [a, b] of [[91, 0], [0, 181], [NaN, 1], [1, undefined], [null, null]]) assert.equal(isValidCoordinate(a, b), false)
})
await ok('shown to six decimals, with a Google Maps link that opens that spot', () => {
  assert.equal(formatCoords(-4.28491, 39.5897123), '-4.284910, 39.589712'); assert.equal(mapsUrl(-4.28491, 39.589712), 'https://www.google.com/maps?q=-4.284910,39.589712')
})
await ok('accuracy is shown in metres and a rough fix (over 100 m) is flagged', () => {
  assert.deepEqual(accuracyNote(8.4), { text: '±8 m', weak: false }); assert.deepEqual(accuracyNote(350), { text: '±350 m', weak: true }); assert.deepEqual(accuracyNote(null), { text: '', weak: false })
})
await ok('every way a phone can refuse gives a plain-language reason', () => {
  assert.match(describeGeoError({ code: 1 }), /blocked/); assert.match(describeGeoError({ code: 2 }), /GPS signal/); assert.match(describeGeoError({ code: 3 }), /too long/); assert.match(describeGeoError(null), /can't share/)
})
await ok('a good fix comes back rounded, with accuracy and the time it was taken', async () => {
  const r = await captureLocation(fakeGeo({ pos: pos(-4.2849134567, 39.5897123456, 8.44) }))
  assert.deepEqual(r, { lat: -4.284913, lng: 39.589712, accuracy: 8.4, recordedAt: '2026-10-20T08:30:00.000Z' })
})
await ok('it asks for the best accuracy the phone can give, with no cached position', async () => {
  let seen; await captureLocation({ getCurrentPosition: (s, f, o) => { seen = o; s(pos(1, 1, 5)) } })
  assert.equal(seen.enableHighAccuracy, true); assert.equal(seen.maximumAge, 0); assert.equal(seen.timeout, 20000)
})
await ok('permission denied, no signal and a timeout are each reported properly', async () => {
  for (const [code, re] of [[1, /blocked/], [2, /GPS signal/], [3, /too long/]]) await assert.rejects(captureLocation(fakeGeo({ error: { code } })), re)
})
await ok('a browser with no location support, or a nonsense position, is refused', async () => {
  await assert.rejects(captureLocation(undefined), /can't share/); await assert.rejects(captureLocation({}), /can't share/)
  await assert.rejects(captureLocation(fakeGeo({ pos: pos(200, 10, 5) })), /GPS signal/)
})
const base = { jobType: 'Site Survey', location: 'Diani', requestedBy: 'x', visitDate: '2026-10-20', transportFrom: 'Office', transportTo: ['Diani'], transportAmount: 0, status: 'Pending' }
const gps = { lat: -4.284913, lng: 39.589712, accuracy: 8.4, recordedAt: '2026-10-20T08:30:00.000Z' }
await ok('a job saves its GPS position into the four database columns', () => assert.deepEqual(
  (({ gps_lat, gps_lng, gps_accuracy, gps_recorded_at }) => ({ gps_lat, gps_lng, gps_accuracy, gps_recorded_at }))(jobToDbFields({ ...base, gps })),
  { gps_lat: -4.284913, gps_lng: 39.589712, gps_accuracy: 8.4, gps_recorded_at: '2026-10-20T08:30:00.000Z' }))
await ok('gps: null clears a saved location, but not mentioning gps leaves it alone (no other update can wipe it)', () => {
  const cleared = jobToDbFields({ ...base, gps: null }); assert.equal(cleared.gps_lat, null); assert.equal(cleared.gps_recorded_at, null)
  const untouched = jobToDbFields(base); assert.ok(!('gps_lat' in untouched) && !('gps_lng' in untouched))
})
await ok('a saved job reads its GPS back for the screens (nothing shows for jobs without one)', () => {
  const j = mapJob({ id: 1, job_code: 'JC-1', gps_lat: '-4.284913', gps_lng: '39.589712', gps_accuracy: '8.4', gps_recorded_at: '2026-10-20T08:30:00Z' })
  assert.deepEqual([j.gpsLat, j.gpsLng, j.gpsAccuracy, j.gpsRecordedAt], [-4.284913, 39.589712, 8.4, '2026-10-20T08:30:00Z'])
  const none = mapJob({ id: 2, job_code: 'JC-2' }); assert.deepEqual([none.gpsLat, none.gpsLng, none.gpsAccuracy, none.gpsRecordedAt], [null, null, null, null])
})
console.log(`\n${n} checks passed`)
