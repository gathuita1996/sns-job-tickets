import { useMemo } from 'react'
import { PAGE, buildReceiptLayout, textWidth } from '../lib/receiptLayout'
import { GLOBE_PNG, LOGO_PNG } from '../lib/receiptImages'

// The receipt as it will be sent, drawn on screen. It is drawn from the very same list of shapes and words that is written
// into the PDF (receiptLayout.js), so what is checked here is what the customer receives.
const rgb = (c) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`
const IMAGES = { logo: `data:image/png;base64,${LOGO_PNG}`, globe: `data:image/png;base64,${GLOBE_PNG}` }
const flip = (y) => PAGE.h - y            // the PDF page counts up from the bottom, the screen counts down from the top

export default function ReceiptPreview({ model }) {
  const items = useMemo(() => buildReceiptLayout(model), [model])
  return (
    <svg viewBox={`0 0 ${PAGE.w} ${PAGE.h}`} role="img" aria-label={`Receipt ${model.receiptNo} for ${model.customerName}`}
      style={{ width: '100%', height: 'auto', display: 'block', background: '#fff', borderRadius: 6, border: '1px solid var(--line)', boxShadow: '0 6px 22px -12px rgba(20,40,60,0.35)' }}>
      <rect x="0" y="0" width={PAGE.w} height={PAGE.h} fill="#fff" />
      {items.map((it, i) => {
        if (it.kind === 'path') return <path key={i} d={it.d} fill={rgb(it.fill)} fillRule={it.rule === 'evenodd' ? 'evenodd' : 'nonzero'} transform={`translate(0 ${PAGE.h}) scale(1 -1)`} />
        if (it.kind === 'rect') return <rect key={i} x={it.x} y={flip(it.y + it.h)} width={it.w} height={it.h} fill={rgb(it.fill)} />
        if (it.kind === 'line') return <line key={i} x1={it.x1} y1={flip(it.y1)} x2={it.x2} y2={flip(it.y2)} stroke={rgb(it.stroke)} strokeWidth={it.width} />
        if (it.kind === 'image') return <image key={i} href={IMAGES[it.id]} x={it.x} y={flip(it.y + it.h)} width={it.w} height={it.h} preserveAspectRatio="none" />
        if (it.kind === 'text') {
          // each word is stretched or squeezed to exactly the width it has in the PDF, so the screen looks the same even in another font
          return <text key={i} x={it.x} y={flip(it.y)} fontSize={it.size} fontFamily="Helvetica, Arial, 'Liberation Sans', sans-serif" fontWeight={it.font === 'bold' ? 700 : 400} fill={rgb(it.fill)}
            textLength={textWidth(it.font, it.size, it.text)} lengthAdjust="spacingAndGlyphs" xmlSpace="preserve">{it.text}</text>
        }
        return null
      })}
    </svg>
  )
}
