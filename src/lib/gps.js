// GPS capture for site surveys. Plain functions (no React, no database) so they can be tested on their own.

export function isValidCoordinate(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}
const round6 = (n) => Math.round(n * 1e6) / 1e6            // about 11 cm: far finer than a phone's GPS can really tell

export const formatCoords = (lat, lng) => `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`
export const mapsUrl = (lat, lng) => `https://www.google.com/maps?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`

// "±8 m", and whether the fix is too rough to trust (over 100 m usually means no real GPS signal yet).
export function accuracyNote(meters) {
  if (meters == null || !Number.isFinite(Number(meters))) return { text: '', weak: false }
  return { text: `±${Math.round(Number(meters))} m`, weak: Number(meters) > 100 }
}

export function describeGeoError(err) {
  const code = err && err.code
  if (code === 1) return 'Location access is blocked. Allow location for this site in your browser settings, then try again.'
  if (code === 2) return "Couldn't find a GPS signal. Move outdoors or near a window and try again."
  if (code === 3) return 'Finding your position took too long. Try again.'
  return "This device or browser can't share its location."
}

// Asks the device where it is. `geo` is navigator.geolocation (passed in so it can be faked in tests).
// Resolves { lat, lng, accuracy, recordedAt }; rejects with an Error whose message is ready to show a person.
export function captureLocation(geo, options = {}) {
  return new Promise((resolve, reject) => {
    if (!geo || typeof geo.getCurrentPosition !== 'function') { reject(new Error(describeGeoError(null))); return }
    geo.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        if (!isValidCoordinate(latitude, longitude)) { reject(new Error(describeGeoError({ code: 2 }))); return }
        resolve({
          lat: round6(latitude), lng: round6(longitude),
          accuracy: Number.isFinite(accuracy) ? Math.round(accuracy * 10) / 10 : null,
          recordedAt: new Date(pos.timestamp || Date.now()).toISOString(),
        })
      },
      (err) => reject(new Error(describeGeoError(err))),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0, ...options },
    )
  })
}
