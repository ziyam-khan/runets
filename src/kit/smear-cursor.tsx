'use client'
// The live half of the terminal: useRetype backspaces the old word and types the new one, and SmearCursor is a block
// cursor that smears from cell to cell. Load it after the page; TerminalLines (terminal.tsx) renders without it.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/**
 * Retypes a word: the cursor lands, backspaces `from`, pauses and types `to` at an uneven human pace. Returns the
 * text mid-edit, or undefined before it starts and once it is done. `id` names one edit; a new id starts a new
 * edit. Paused mid-edit (run false), the word finishes at once.
 */
export function useRetype(id: number, from: string, to: string, run: boolean, { land = 450, erase = 40, gap = 240, type = [55, 105] as [number, number] } = {}) {
  const [edit, setEdit] = useState<{ id: number; text: string }>()
  const done = useRef<number>(undefined)
  const text = edit?.id === id ? edit.text : undefined
  useEffect(() => {
    if (done.current === id) return
    if (!run) { if (text !== undefined) { setEdit({ id, text: to }); done.current = id } return }
    const steps: [number, string][] = [[0, from]]
    let t = land
    for (let n = from.length - 1; n >= 0; n--) steps.push([(t += erase), from.slice(0, n)])
    t += gap
    for (let n = 1; n <= to.length; n++) steps.push([(t += type[0] + Math.random() * (type[1] - type[0])), to.slice(0, n)])
    const timers = steps.map(([ms, value]) => setTimeout(() => setEdit({ id, text: value }), ms))
    timers.push(setTimeout(() => { done.current = id }, t))
    return () => timers.forEach(clearTimeout)
  }, [id, run]) // one plan per edit: from and to belong to the id
  return { text, busy: text !== undefined && text !== to }
}

type Pt = [number, number]
/**
 * A block cursor over its positioned parent that follows `target` (an element the size of one cell). Each corner
 * chases its own spot, the one nearest the target fastest, so a jump leaves a tapering smear while a keystroke,
 * one cell along the same row, steps crisply. It blinks unless `busy`. Re-aims after every render and on resize.
 */
export function SmearCursor({ target, busy, lead = 0.6, trail = 0.3, curve = 2 }: { target: RefObject<HTMLElement | null>; busy?: boolean; lead?: number; trail?: number; curve?: number }) {
  const self = useRef<HTMLSpanElement>(null)
  const aim = useRef<(snap?: boolean) => void>(undefined)
  useEffect(() => {
    const el = self.current!
    let cur: Pt[] | null = null, goal: Pt[] = [], pull: number[] = [], raf = 0, last = 0
    const draw = () => { el.style.clipPath = `polygon(${cur!.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ')})` }
    const step = (now: number) => {
      const frames = Math.min(4, (now - last) / 16.7); last = now
      let moving = false
      cur!.forEach((p, i) => { for (const n of [0, 1]) { p[n] += (goal[i][n] - p[n]) * (1 - (1 - pull[i]) ** frames); if (Math.abs(goal[i][n] - p[n]) > 0.3) moving = true } })
      if (!moving) cur = goal.map(p => [...p] as Pt)
      draw()
      raf = moving ? requestAnimationFrame(step) : 0
    }
    aim.current = (snap = false) => {
      const c = target.current
      if (!c) return
      const box = el.getBoundingClientRect(), r = c.getBoundingClientRect()
      const x = r.left - box.left, y = r.top - box.top
      goal = [[x, y], [x + r.width, y], [x + r.width, y + r.height], [x, y + r.height]]
      const keystroke = cur && Math.abs(y - cur[0][1]) < 1 && Math.abs(x - cur[0][0]) < 2 * r.width
      if (snap || !cur || keystroke || matchMedia('(prefers-reduced-motion: reduce)').matches) { cancelAnimationFrame(raf); raf = 0; cur = goal.map(p => [...p] as Pt); draw(); return }
      const d = cur.map(([px, py]) => Math.hypot(px - x - r.width / 2, py - y - r.height / 2)), lo = Math.min(...d), hi = Math.max(...d)
      pull = d.map(v => lead + (trail - lead) * (hi > lo ? ((v - lo) / (hi - lo)) ** curve : 0))
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(step) }
    }
    aim.current(true)
    const ro = new ResizeObserver(() => aim.current?.(true))
    ro.observe(el.parentElement!)
    return () => { ro.disconnect(); cancelAnimationFrame(raf); aim.current = undefined }
  }, [target, lead, trail, curve])
  useLayoutEffect(() => { aim.current?.() })
  return <span ref={self} className="k-smear" aria-hidden="true" data-busy={busy || undefined} />
}
