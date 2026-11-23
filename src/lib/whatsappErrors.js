// What WhatsApp's error codes mean, in plain words for the person sending the receipt. Plain logic, shared by the server
// (which stores the sentence next to the message) and the screens.
//
//   explainWhatsappError(131026, '...')  ->  { text, kind, retry }
//     text  : one or two sentences a non-technical person can act on
//     kind  : who has to do something --
//             'number'   the customer's number (fix it on the customer)
//             'setup'    the WhatsApp account, token or template in Meta / Netlify (the person who set it up)
//             'billing'  the payment method on the Meta account
//             'wait'     nothing is wrong: too many messages too fast, or held back -- try again a little later
//             'temporary' WhatsApp had a hiccup -- trying again is fine
//             'other'    anything else
//     retry : true when pressing "Send again" is worth trying
const RULES = [
  { codes: [190, 102, 463, 467, 0], kind: 'setup', retry: false, text: 'WhatsApp did not accept the access token. It may have expired or been replaced. Create a new permanent token in Meta and update it in Netlify.' },
  { codes: [3, 10], ranges: [[200, 299]], kind: 'setup', retry: false, text: 'The access token is not allowed to send WhatsApp messages from this number. Check the token\'s permissions in Meta (whatsapp_business_messaging).' },
  { codes: [133010], kind: 'setup', retry: false, text: 'This WhatsApp number is not registered yet. Finish registering the number in Meta, then try again.' },
  { codes: [131030], kind: 'setup', retry: false, text: 'This customer\'s number is not on the list of allowed test numbers. The WhatsApp account is still in test mode.' },
  { codes: [131031, 368, 131048, 131037], kind: 'setup', retry: false, text: 'The WhatsApp business account is restricted or its display name has not been approved. Check the account status in Meta Business settings.' },
  { codes: [131042], kind: 'billing', retry: false, text: 'WhatsApp cannot send because of a payment problem on the Meta account. Add or fix the payment method in Meta Business settings.' },
  { codes: [132001], kind: 'setup', retry: false, text: 'The receipt message template was not found or is not approved yet. Check its status in Meta (WhatsApp Manager, Message templates).' },
  { codes: [132015, 132016], kind: 'setup', retry: false, text: 'The receipt message template is paused or disabled by WhatsApp. Check its status in Meta (WhatsApp Manager, Message templates).' },
  { codes: [132000, 132005, 132007, 132012, 132018], kind: 'setup', retry: false, text: 'The receipt message does not match the approved template (the number of fields or their format). The template in Meta must be the one in the setup guide.' },
  { codes: [131026], kind: 'number', retry: false, text: 'This number cannot receive the message. It is probably not on WhatsApp, or it is mistyped. Check the number on the customer.' },
  { codes: [131021], kind: 'number', retry: false, text: 'The recipient is the same as the sending number. Use the customer\'s own number.' },
  { codes: [131049], kind: 'wait', retry: true, text: 'WhatsApp held this message back to keep its users from getting too many messages from businesses. Try again later.' },
  { codes: [131056, 130429, 80007, 4, 17, 32, 613], kind: 'wait', retry: true, text: 'Too many messages were sent too quickly. Wait a few minutes and try again.' },
  { codes: [131052, 131053], kind: 'other', retry: true, text: 'WhatsApp could not use the receipt PDF (it could not download or accept the file). Try again; if it keeps failing, send the receipt by opening WhatsApp yourself.' },
  { codes: [1, 2, 131000, 131016, 131057, 133004, 133005, 133006, 133008, 133009, 133015, 135000], kind: 'temporary', retry: true, text: 'WhatsApp had a temporary problem. Try again in a few minutes.' },
  { codes: [100, 131008, 131009], kind: 'other', retry: false, text: 'WhatsApp did not accept the request. Check that the phone number ID and the template name in Netlify match your WhatsApp account.' },
]

export function explainWhatsappError(code, details = '') {
  const n = code == null || code === '' ? NaN : Number(code)                 // no code is not code 0
  const rule = Number.isFinite(n) ? RULES.find((r) => r.codes.includes(n) || (r.ranges || []).some(([from, to]) => n >= from && n <= to)) : null
  const extra = String(details == null ? '' : details).replace(/\s+/g, ' ').trim()
  if (rule) return { text: rule.text, kind: rule.kind, retry: rule.retry }
  const base = Number.isFinite(n) && n > 0 ? `WhatsApp could not send the message (error ${n}).` : 'WhatsApp could not send the message.'
  return { text: extra ? `${base} ${extra}`.slice(0, 400) : base, kind: 'other', retry: true }
}
