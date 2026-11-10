'use client'
// <Fx>: one rune-fx layer beside its parent element. The canvas covers the parent plus the room the
// effect needs past its edges, under or over the parent's content, and never takes the pointer.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { effect as findEffect, paramsOf, type EffectDef, type Occluder, type Params } from './effects'
import { fxEngine, type Target, type Texture } from './engine'

export type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void
export type FxProps = {
  effect: string | EffectDef
  preset?: string
  params?: Params
  /** Under the parent's content (fills, halos) or over it (sparkles, distortion). */
  place?: 'under' | 'over'
  /** Corner radius in points; the parent's own radius by default. */
  radius?: number
  /** What distortion and glass read: an image URL, or a painter for a canvas the size of the element. */
  backdrop?: string | Paint
  /** An alpha mask for mask glow and text sheen, painted at the element's size. */
  mask?: Paint
  /** Drives a glow's heat: it lights fast and cools slowly instead of cutting off. */
  hot?: boolean
  /** Change it to fire a one-shot (ping, ripple, burst, shockwave, zap) now. */
  trigger?: number
  /** Raised elements inside the parent that cast shadows (Light). */
  occluders?: () => Occluder[]
  /** Change it to redraw for the next second: something the layer reads, such as its occluders, moved on its own. */
  wake?: number
  /** The lamp follows the pointer (Light). */
  followPointer?: boolean
  /** Weather: the scene's skyline, heights 0 (top) to 1 (bottom) across the image. */
  skyline?: number[]
  /** Image backdrops are framed like CSS object-position. */
  focus?: [number, number]
  /** The effect's shape inside the parent, per frame (a lens that drifts); the parent's box by default. */
  shape?: (time: number, w: number, h: number) => { x: number; y: number; w: number; h: number; r?: number }
  seed?: number
  maxScale?: number
  className?: string
}

const ATTACK = 0.06, COOL = 0.55
export function Fx({ effect, preset, params, place = 'under', radius, backdrop, mask, hot, trigger, occluders, wake, followPointer, skyline, focus = [0.5, 0.5], shape, seed = 1, maxScale = 2, className }: FxProps) {
  const def = typeof effect === 'string' ? findEffect(effect) : effect
  const ref = useRef<HTMLCanvasElement>(null)
  const live = useRef({ params: {} as Params, heat: { on: hot ?? true, at: -1e3, from: 1 }, t0: -1e3, woke: -1e3, pointer: undefined as [number, number] | undefined })
  const [box, setBox] = useState<{ w: number; h: number; r: number; m: [number, number, number, number]; s: number } | null>(null)
  const p = def ? paramsOf(def, preset, params) : {}
  live.current.params = p
  const key = JSON.stringify(p)

  // Measure the parent and size the canvas to it plus the effect's reach.
  useEffect(() => {
    const canvas = ref.current, host = canvas?.parentElement
    if (!canvas || !host || !def) return
    const measure = () => {
      const w = host.clientWidth, h = host.clientHeight
      const r = radius ?? (parseFloat(getComputedStyle(host).borderTopLeftRadius) || 0)
      const m = def.reach(live.current.params, { x: 0, y: 0, w, h }).map(v => Math.ceil(v)) as [number, number, number, number]
      const s = Math.min(window.devicePixelRatio || 1, maxScale)
      setBox(b => (b && b.w === w && b.h === h && b.r === r && b.s === s && b.m.every((v, k) => v === m[k]) ? b : { w, h, r, m, s }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    return () => ro.disconnect()
  }, [def, radius, maxScale, key])

  // Heat follows `hot` on the engine clock.
  useEffect(() => {
    const e = fxEngine(), now = e.now(), h = live.current.heat
    const cur = heatAt(h, now)
    live.current.heat = { on: hot ?? true, at: now, from: cur }
    e.wake()
  }, [hot])

  // A wake redraws for a second, even where the layer otherwise rests on one still frame (no GPU).
  useEffect(() => { if (wake) { const e = fxEngine(); live.current.woke = e.now(); e.wake() } }, [wake])

  // One-shots start now.
  useEffect(() => { if (trigger) { const e = fxEngine(); live.current.t0 = e.now(); e.wake() } }, [trigger])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !box || !def) return
    const e = fxEngine()
    if (!e.supported()) return
    const [l, t, r, b] = box.m
    canvas.width = Math.round((box.w + l + r) * box.s); canvas.height = Math.round((box.h + t + b) * box.s)
    const rect = { x: l, y: t, w: box.w, h: box.h }
    let backdropTex: Target['backdrop']
    let disposed = false
    const target: Target = {
      canvas, scale: box.s, animate: true, dedicated: false,
      layers: time => {
        const pp = { ...live.current.params }
        if (hot !== undefined) pp.heat = heatAt(live.current.heat, time) * (typeof pp.heat === 'number' ? pp.heat : 1)
        for (const k of ['t0', 'burst', 'zap'] as const) if (k in pp && (k === 't0' || (pp[k] as number) >= 0)) pp[k] = live.current.t0
        if (trigger === undefined) { if ('burst' in pp) pp.burst = -1; if ('zap' in pp) pp.zap = -1 }
        const occ = occluders?.().map(o => ({ ...o, x: o.x + l, y: o.y + t }))
        const ptr = live.current.pointer
        const sh = shape?.(time, box.w, box.h)
        return [{ def, params: pp, frame: { rect: sh ? { x: l + sh.x, y: t + sh.y, w: sh.w, h: sh.h } : rect, radius: sh?.r ?? box.r, seed, occluders: occ, skyline, pointer: ptr ? [ptr[0] + l, ptr[1] + t] : undefined } }]
      },
    }
    // A heated glow or a one-shot draws only while it changes; everything else loops.
    const settles = trigger !== undefined || (hot !== undefined && def.id === 'glow' && !live.current.params.breathe && live.current.params.style !== 'aura')
    if (def.still?.(live.current.params)) target.animate = false
    if (settles) { target.animate = false; Object.defineProperty(target, 'until', { get: () => Math.max(live.current.t0 + 2.6, live.current.heat.at + 4) }) }
    else if (wake !== undefined) Object.defineProperty(target, 'until', { get: () => live.current.woke + 1 })
    if (mask) { const c = paintCanvas(mask, box.w, box.h, box.s); target.source = { source: c, version: Date.now() } }
    if (typeof backdrop === 'function') {
      const c = paintCanvas(ctx => { ctx.translate(l * box.s, t * box.s); ctx.scale(box.s, box.s); backdrop(ctx, box.w, box.h) }, box.w + l + r, box.h + t + b, 1, box.s)
      backdropTex = { source: c, version: Date.now() }
      target.backdrop = backdropTex
    }
    let remove = e.add(target)
    if (typeof backdrop === 'string') {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => { if (disposed) return; target.backdrop = { source: img, version: 1, bdx: cover(img.naturalWidth, img.naturalHeight, canvas.width, canvas.height, focus[0], focus[1]) } as Texture & { bdx: [number, number, number, number] }; target.dirty = true; e.wake() }
      img.src = backdrop
    }
    const host = canvas.parentElement
    const move = (ev: PointerEvent) => { const rr = host!.getBoundingClientRect(); live.current.pointer = [ev.clientX - rr.left, ev.clientY - rr.top]; target.dirty = true; e.wake() }
    if (followPointer && host) host.addEventListener('pointermove', move)
    return () => { disposed = true; remove(); remove = () => {}; if (followPointer && host) host.removeEventListener('pointermove', move) }
  }, [box, def, key, mask, backdrop, hot === undefined, trigger === undefined, wake === undefined, followPointer, occluders, seed, skyline, focus[0], focus[1], shape])

  if (!def) return null
  const [l, t, r, b] = box?.m ?? [0, 0, 0, 0]
  const style: CSSProperties = { position: 'absolute', left: -l, top: -t, width: box ? box.w + l + r : '100%', height: box ? box.h + t + b : '100%', pointerEvents: 'none', zIndex: place === 'under' ? -1 : 1 }
  return <canvas ref={ref} aria-hidden="true" className={className ? `fx ${className}` : 'fx'} data-fx={def.id} style={style} />
}

function heatAt(h: { on: boolean; at: number; from: number }, time: number) {
  const dt = Math.max(0, time - h.at)
  return h.on ? 1 - (1 - h.from) * Math.exp(-dt / ATTACK) : h.from * Math.exp(-dt / COOL)
}
function paintCanvas(paint: Paint, w: number, h: number, s: number, outer = 1) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * s * outer)); c.height = Math.max(1, Math.round(h * s * outer))
  const ctx = c.getContext('2d')!
  if (outer === 1) ctx.scale(s, s)
  paint(ctx, w, h)
  return c
}
/** Canvas uv to image uv for an image drawn with object-fit: cover, centred. */
export function cover(iw: number, ih: number, cw: number, ch: number, ox = 0.5, oy = 0.5): [number, number, number, number] {
  const s = Math.max(cw / iw, ch / ih), fx = cw / (iw * s), fy = ch / (ih * s)
  return [fx, fy, (1 - fx) * ox, (1 - fy) * oy]
}
