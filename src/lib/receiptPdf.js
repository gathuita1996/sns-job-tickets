// Writes the customer receipt as a real PDF file (one letter-size page, selectable text, the standard Helvetica
// fonts, so it opens the same on a phone, in WhatsApp, in a browser or in Word). No library: the file is small and
// simple enough to write directly, which keeps the app light and the result exactly what the layout says.
import { LOGO_PNG, GLOBE_PNG } from './receiptImages.js'
import { PAGE, winAnsiBytes } from './receiptLayout.js'

const latin1 = (s) => { const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff; return out }
const num = (v) => { const r = Math.round(Number(v) * 1000) / 1000; return Object.is(r, -0) ? '0' : String(r) }
const rgb = (c) => c.map(num).join(' ')

function concat(chunks) {
  let n = 0
  for (const c of chunks) n += c.length
  const out = new Uint8Array(n)
  let p = 0
  for (const c of chunks) { out.set(c, p); p += c.length }
  return out
}

// A PNG's compressed pixel data can be put into a PDF as it is (with the PNG "predictor" told to the reader), so
// the pictures are never decoded or re-compressed here. Only plain 8-bit RGB, non-interlaced PNG files are supported.
export function readPng(base64) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]
  if (!sig.every((b, i) => bytes[i] === b)) throw new Error('The receipt picture is not a PNG file.')
  let pos = 8, w = 0, h = 0
  const idat = []
  while (pos + 8 <= bytes.length) {
    const len = ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7])
    const data = bytes.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      w = ((data[0] << 24) | (data[1] << 16) | (data[2] << 8) | data[3]) >>> 0
      h = ((data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7]) >>> 0
      if (data[8] !== 8 || data[9] !== 2 || data[12] !== 0) throw new Error('The receipt picture must be an 8-bit RGB PNG that is not interlaced.')
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  return { w, h, data: concat(idat) }
}

// bytes of a text, written as a PDF string: (...) with the awkward characters escaped
function pdfText(text) {
  let s = ''
  for (const b of winAnsiBytes(text)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += '\\' + String.fromCharCode(b)
    else if (b < 32 || b > 126) s += '\\' + b.toString(8).padStart(3, '0')
    else s += String.fromCharCode(b)
  }
  return `(${s})`
}

// document-information strings can hold any letter: plain when ASCII, otherwise UTF-16
function infoString(text) {
  const s = String(text == null ? '' : text)
  if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/([\\()])/g, '\\$1')})`
  let hex = 'FEFF'
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase()
  return `<${hex}>`
}

// D:20261121175000+03'00'  (Kenya time)
function pdfDate(date) {
  const t = new Date(new Date(date).getTime() + 3 * 3600 * 1000)
  const p = (n, l = 2) => String(n).padStart(l, '0')
  return `D:${p(t.getUTCFullYear(), 4)}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}+03'00'`
}

// "M10 20C1 2 3 4 5 6Z" -> "10 20 m 1 2 3 4 5 6 c h"
function pathOps(d) {
  let out = ''
  for (const m of d.matchAll(/([MLCZ])([^MLCZ]*)/g)) {
    const op = { M: 'm', L: 'l', C: 'c', Z: 'h' }[m[1]]
    const nums = m[2].trim()
    out += (nums ? nums + ' ' : '') + op + '\n'
  }
  return out
}

function contentStream(layout) {
  let s = ''
  for (const it of layout) {
    if (it.kind === 'path') s += `${rgb(it.fill)} rg\n${pathOps(it.d)}${it.rule === 'evenodd' ? 'f*' : 'f'}\n`
    else if (it.kind === 'rect') s += `${rgb(it.fill)} rg\n${num(it.x)} ${num(it.y)} ${num(it.w)} ${num(it.h)} re f\n`
    else if (it.kind === 'line') s += `${rgb(it.stroke)} RG\n${num(it.width)} w\n${num(it.x1)} ${num(it.y1)} m ${num(it.x2)} ${num(it.y2)} l S\n`
    else if (it.kind === 'image') s += `q ${num(it.w)} 0 0 ${num(it.h)} ${num(it.x)} ${num(it.y)} cm /${it.id === 'logo' ? 'Im1' : 'Im2'} Do Q\n`
    else if (it.kind === 'text') s += `${rgb(it.fill)} rg\nBT /${it.font === 'bold' ? 'F2' : 'F1'} ${num(it.size)} Tf ${num(it.x)} ${num(it.y)} Td ${pdfText(it.text)} Tj ET\n`
  }
  return s
}

// layout: the list from buildReceiptLayout.  Returns the PDF file as bytes.
export function buildReceiptPdf(layout, { title = 'Receipt', author = 'Swahili Net Solution', subject = '', createdAt = new Date() } = {}) {
  const logo = readPng(LOGO_PNG), globe = readPng(GLOBE_PNG)
  const content = latin1(contentStream(layout))

  const dict = (s) => latin1(s)
  const stream = (head, data) => concat([latin1(`<< ${head} /Length ${data.length} >>\nstream\n`), data, latin1('\nendstream')])
  const image = (img) => stream(`/Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${img.w} >>`, img.data)

  // object numbers: 1 catalog, 2 pages, 3 page, 4 content, 5-6 fonts, 7-8 pictures, 9 document information
  const objects = [
    dict('<< /Type /Catalog /Pages 2 0 R >>'),
    dict('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    dict(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << /Im1 7 0 R /Im2 8 0 R >> >> /Contents 4 0 R >>`),
    stream('', content),
    dict('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    dict('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    image(logo),
    image(globe),
    dict(`<< /Title ${infoString(title)} /Author ${infoString(author)} /Subject ${infoString(subject)} /Creator ${infoString('SNS Job Cards')} /Producer ${infoString('SNS Job Cards')} /CreationDate (${pdfDate(createdAt)}) /ModDate (${pdfDate(createdAt)}) >>`),
  ]

  const chunks = [latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')]
  let offset = chunks[0].length
  const offsets = []
  objects.forEach((body, i) => {
    offsets.push(offset)
    const head = latin1(`${i + 1} 0 obj\n`), tail = latin1('\nendobj\n')
    chunks.push(head, body, tail)
    offset += head.length + body.length + tail.length
  })
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) xref += `${String(o).padStart(10, '0')} 00000 n \n`
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 9 0 R >>\nstartxref\n${offset}\n%%EOF\n`
  chunks.push(latin1(xref))
  return concat(chunks)
}
