'use client'
// A slider with give: it is a native range input (so keys, screen readers and forms work as usual) over a drawn
// track. Drag past either end and the track stretches toward the pointer, more slowly the further you pull, then
// springs back when you let go.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export function ElasticSlider({ label, min = 0, max = 100, step = 1, value, onValueChange, formatValue = String }: { label: string; min?: number; max?: number; step?: number; value: number; onValueChange: (v: number) => void; formatValue?: (v: number) => ReactNode }) {
  const track = useRef<HTMLDivElement>(null)
  const pressed = useRef(false)
  const [pull, setPull] = useState(0) // px past an end: negative is left
  useEffect(() => {
    const release = () => { pressed.current = false; setPull(0) }
    addEventListener('pointerup', release); addEventListener('pointercancel', release)
    return () => { removeEventListener('pointerup', release); removeEventListener('pointercancel', release) }
  }, [])
  const move = (x: number) => {
    if (!pressed.current || !track.current) return
    const r = track.current.getBoundingClientRect(), past = x < r.left ? x - r.left : x > r.right ? x - r.right : 0
    setPull(Math.sign(past) * Math.min(28, 4 * Math.sqrt(Math.abs(past)))) // a rubber band: the give shrinks as you pull
  }
  const share = (value - min) / (max - min || 1)
  return <div className="k-elastic" data-pulling={pull !== 0 || undefined} onPointerDown={e => { pressed.current = true; move(e.clientX) }} onPointerMove={e => move(e.clientX)}>
    <div className="k-elastic-head"><span>{label}</span><output>{formatValue(value)}</output></div>
    <div ref={track} className="k-elastic-track" style={{ '--k-share': share, '--k-pull': `${pull}px`, '--k-stretch': 1 + Math.abs(pull) / 300 } as CSSProperties}>
      <div className="k-elastic-fill" />
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} aria-valuetext={String(formatValue(value))} onChange={e => onValueChange(Number(e.target.value))} />
    </div>
  </div>
}
