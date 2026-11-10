'use client'
// A page outline: links to the page's sections, indented by heading depth, with a marker on the section you are
// reading. The section in view is the last heading that has passed the top third of the window. `compact` draws
// the outline as ticks (longer for higher headings) that open into the labelled list on hover or focus.
import { useEffect, useState, type CSSProperties } from 'react'

export type OutlineItem = { title: string; url: string; depth: number }

export function Outline({ items, label = 'On this page', compact }: { items: OutlineItem[]; label?: string; compact?: boolean }) {
  const [active, setActive] = useState(items[0]?.url)
  useEffect(() => {
    const heads = items.map(i => document.getElementById(decodeURIComponent(i.url.slice(1)))).filter((h): h is HTMLElement => !!h)
    if (!heads.length) return
    let raf = 0
    const pick = () => { raf = 0; const line = innerHeight / 3; let at = heads[0]; for (const h of heads) if (h.getBoundingClientRect().top <= line) at = h; setActive(`#${at.id}`) }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(pick) }
    pick()
    addEventListener('scroll', onScroll, { passive: true })
    return () => { removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [items])
  const top = Math.min(...items.map(i => i.depth))
  return <nav className="k-outline" data-compact={compact || undefined} aria-label={label}>
    <p className="k-outline-label">{label}</p>
    <ol>{items.map(i => <li key={i.url} style={{ '--k-depth': i.depth - top } as CSSProperties}>
      <a href={i.url} aria-current={active === i.url ? 'location' : undefined}><span className="k-outline-tick" aria-hidden="true" /><span className="k-outline-text">{i.title}</span></a>
    </li>)}</ol>
  </nav>
}
