// The Director's late-payment email. Netlify runs this by itself every day of the week at 14:31 UTC, which is 5:31 pm in
// Nairobi (one minute after the 5:30 pm closing hour), Sundays and public holidays included. All the work is in
// ../lib/lateAlert.mjs; this file hands it the real environment and the real network, and holds the schedule.
//
// The schedule has to be written out here, as a plain text, because Netlify reads it from this file when it builds the
// site. A test checks that it still says 17:31 in Nairobi. Scheduled functions run only on the live (production) site; to try
// it by hand, open Netlify -> Logs & metrics -> Functions -> late-payments-alert -> "Run now".
import { runLateAlert } from '../lib/lateAlert.mjs'

export default async () => {
  const result = await runLateAlert({ env: process.env, fetch: globalThis.fetch })
  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

export const config = { schedule: '31 14 * * *' }
