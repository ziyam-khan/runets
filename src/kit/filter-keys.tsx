'use client'

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { playful, snappy } from '../motion'

/** A number that rolls to its new value. The sentence around it carries the meaning for screen readers. */
export function Roll({ value }: { value: number }) {
  return <span className="roll" aria-hidden="true"><AnimatePresence mode="popLayout" initial={false}><motion.span key={value} initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1, transition: snappy.enter }} exit={{ y: '-100%', opacity: 0, transition: snappy.exit }}>{value}</motion.span></AnimatePresence></span>
}

/** The count on a filter key: it pops when the key is pressed or released, not when the page first paints. */
function KeyCount({ value, on }: { value: number; on: boolean }) {
  const ready = useRef(false)
  useEffect(() => { ready.current = true }, [])
  return <motion.span key={String(on)} className="key-count" initial={ready.current ? { scale: 0.6 } : false} animate={{ scale: 1, transition: playful.enter }}>{value}</motion.span>
}

export type FilterOption<T extends string> = { id: T; label: string; count: number; palette?: 'light' | 'dark' }

/** Raised toggle keys: one is down at a time, each carries its count, and a press squashes the key. */
export function FilterKeys<T extends string>({ label, options, value, onChange }: { label: string; options: FilterOption<T>[]; value: T; onChange: (next: T) => void }) {
  return <div className="filter" role="group" aria-label={label}>{options.map(option => {
    const on = value === option.id
    return <motion.button key={option.id} type="button" className="key" data-palette={option.palette} aria-pressed={on} onClick={() => onChange(option.id)} whileTap={{ scale: 0.94, transition: playful.enter }}>{option.label}<KeyCount value={option.count} on={on} /></motion.button>
  })}</div>
}

/** "Showing N of M" with a rolling N, announced politely as one sentence. */
export function ResultCount({ shown, total, noun }: { shown: number; total: number; noun: string }) {
  return <p className="meta result-count" role="status"><span className="sr-only">Showing {shown} of {total} {noun}</span><span aria-hidden="true">Showing <Roll value={shown} /> of {total}</span></p>
}
