'use client'
// A marquee: the row is drawn twice and slides left by one copy's width, then starts over, so the loop has no seam.
// The speed is in pixels per second, measured from the row itself. It pauses while hovered or focused, when `play`
// is false and, through the kit's reduced-motion rule, for visitors who ask for less motion.
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export function Marquee({ children, speed = 40, play = true, gap = 16, label, className }: { children: ReactNode; speed?: number; play?: boolean; gap?: number; label?: string; className?: string }) {
  const row = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = row.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.scrollWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const style = { '--k-mq-gap': `${gap}px`, '--k-mq-time': `${Math.max(1, (width + gap) / speed)}s` } as CSSProperties
  return <div className={['k-marquee', className].filter(Boolean).join(' ')} data-play={play || undefined} style={style} role={label ? 'region' : undefined} aria-label={label}>
    <div className="k-marquee-track">
      <div ref={row} className="k-marquee-row">{children}</div>
      <div className="k-marquee-row" aria-hidden="true" inert>{children}</div>
    </div>
  </div>
}
