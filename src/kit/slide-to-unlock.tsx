'use client'
// Slide to unlock: drag the handle to the end of the track (or focus it and press the arrow keys, or End) and the
// action fires. Let go early and it springs back. The label sheens across the track as a hint.
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { ChevronRight } from 'lucide-react'

export function SlideToUnlock({ label, onUnlock }: { label: string; onUnlock: () => void }) {
  const track = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0) // 0 to 1
  const [dragging, setDragging] = useState(false)
  const start = useRef(0)
  const room = () => { const t = track.current!, h = t.querySelector<HTMLElement>('.k-unlock-handle')!; return t.clientWidth - h.offsetWidth - 8 }
  const finish = (v: number) => { if (v >= 0.98) { setAt(1); onUnlock() } else setAt(0) }
  const down = (e: PointerEvent<HTMLButtonElement>) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = e.clientX - at * room(); setDragging(true) }
  const move = (e: PointerEvent<HTMLButtonElement>) => { if (dragging) setAt(Math.min(1, Math.max(0, (e.clientX - start.current) / room()))) }
  const up = () => { if (dragging) { setDragging(false); finish(at) } }
  const key = (e: KeyboardEvent) => {
    const next = e.key === 'End' ? 1 : e.key === 'Home' ? 0 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? at + 0.25 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? at - 0.25 : null
    if (next === null) return
    e.preventDefault()
    const v = Math.min(1, Math.max(0, next)); setAt(v); if (v >= 1) onUnlock()
  }
  return <div ref={track} className="k-unlock" data-dragging={dragging || undefined} style={{ '--k-unlock': at } as CSSProperties}>
    <span className="k-unlock-label" aria-hidden="true">{label}</span>
    <button type="button" className="k-unlock-handle" role="slider" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(at * 100)} aria-valuetext={at >= 1 ? 'Unlocked' : `${Math.round(at * 100)} percent`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}><ChevronRight aria-hidden="true" /></button>
  </div>
}
