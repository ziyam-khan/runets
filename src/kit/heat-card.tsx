'use client'
// A card that warms while you look at it: a neon glow driven by heat, so it lights in 60 ms and cools over half a
// second instead of switching off when the pointer or focus leaves. Focus anywhere inside counts as looking.
import { useState, type HTMLAttributes } from 'react'
import { LazyFx } from '../fx/lazy'
import type { Params } from '../fx/effects'

export function HeatCard({ glow, className, children, ...rest }: HTMLAttributes<HTMLElement> & { /** Glow parameters over the Neon preset. */ glow?: Params }) {
  const [hot, setHot] = useState(false)
  return <article className={['k-heat-card', className].filter(Boolean).join(' ')} {...rest}
    onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)} onFocus={() => setHot(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setHot(false) }}>
    <LazyFx effect="glow" preset="Neon" hot={hot} params={glow} />
    {children}
  </article>
}
