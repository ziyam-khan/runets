'use client'
// Words that swap in place: every word sits in the same grid cell, so the slot is as wide as the widest word and
// never jumps. The new word drops in from above out of a blur while the old one sinks away; it is all CSS
// transitions, so a swap costs no animation library. Control it with `index`, or give `every` to let it cycle.
import { useEffect, useState } from 'react'

export function WordSwap({ words, index, every, className }: { words: string[]; index?: number; /** ms per word when uncontrolled */ every?: number; className?: string }) {
  const [own, setOwn] = useState(0)
  useEffect(() => {
    if (index !== undefined || !every) return
    const id = setInterval(() => setOwn(n => n + 1), every)
    return () => clearInterval(id)
  }, [index, every])
  const n = words.length, at = ((index ?? own) % n + n) % n, before = (at - 1 + n) % n
  return <span className={['k-word-swap', className].filter(Boolean).join(' ')}>
    {words.map((w, k) => <span key={k} data-state={k === at ? 'on' : k === before ? 'off' : undefined} aria-hidden={k !== at || undefined}>{w}</span>)}
  </span>
}
