// A customer's phone number, as WhatsApp wants it. Plain logic, so it can be tested without a browser.
//
// A contact may be written as "0712 345 678", "+254 712 345 678", "254712345678" or "712345678", and sometimes holds two
// numbers ("0712 345 678 / 0733 111 222"). The first one that is a real Kenyan mobile number is used. A number from
// another country is accepted only when it is written with its "+" and country code. Returns the digits WhatsApp wants
// ("254712345678"), or null when there is no usable number -- the old rule of "put 254 in front of anything" would turn a
// typing slip into somebody else's number, so nothing is guessed here.
export function whatsappNumber(contact) {
  const text = String(contact == null ? '' : contact)
  // `spread`: the number is written over several words ("0722 111 222"), which is accepted only when it starts with
  // 0 or 254, so scraps of an address or an ID number cannot be put together into a number.
  const kenyan = (s, spread = false) => { const m = /^(\+?254|0)?([17]\d{8})$/.exec(s.replace(/[\s().-]/g, '')); return m && (m[1] || !spread) ? '254' + m[2] : null }
  for (const chunk of text.split(/[/,;|&\n]+|\s+or\s+|\s+and\s+/i)) { const n = kenyan(chunk); if (n) return n }
  // a number with a name or a note around it: "Wife: 0722 111 222", "0712 345 678 (WhatsApp)"
  const words = text.split(/\s+/).filter(Boolean)
  for (let i = 0; i < words.length; i++) {
    let joined = ''
    for (let j = i; j < Math.min(words.length, i + 4); j++) { joined += words[j]; const n = kenyan(joined, j > i); if (n) return n }
  }
  // +254 is Kenya: a +254 number that is not a Kenyan mobile number is a typing slip, not a number from abroad
  const abroad = /^\+(?!254)(\d{8,15})$/.exec(text.trim().replace(/[\s().-]/g, ''))
  return abroad ? abroad[1] : null
}

// "254712345678" -> "+254 712 345 678"
export function formatWhatsappNumber(digits) {
  const d = String(digits || '')
  if (/^254\d{9}$/.test(d)) return `+254 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`
  return d ? `+${d}` : ''
}
