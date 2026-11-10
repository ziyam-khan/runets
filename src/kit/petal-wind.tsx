'use client'
// Sakura petals on a 2D canvas, so it needs no GPU. Each petal tumbles and flips as it falls on a breeze,
// and it falls slower while it lies flat to the air. The pointer is wind: moving it stirs a coarse field of
// air that decays over about half a second, so the petals near its path are pushed along and keep drifting.
import { useEffect, useRef } from 'react'

export type PetalBox = { x: number; y: number; w: number; h: number }
export type PetalWindProps = {
  /** Petals in the air at once. */
  count?: number
  /** Petal tints as 0xRRGGBB or any CSS colour, one sprite each; a petal is paler at its tip. Changing them repaints the petals in place. */
  colors?: (number | string)[]
  /** Steady wind in px/s: positive blows to the left, the way petals leave a tree on the right. */
  breeze?: number
  /** How fast a petal falls edge-on, in px/s. */
  fall?: number
  /** How hard the pointer pushes the air; 0 turns it off. */
  stir?: number
  /** Where petals are born, in the layer's own pixels: the canopy. The top edge by default. */
  source?: () => PetalBox | null
  /** Change it to send one gust across the layer. */
  trigger?: number
  paused?: boolean
  className?: string
}

const CELL = 48, SPRITE = 32
const TAU = Math.PI * 2

type Petal = { x: number; y: number; vx: number; vy: number; rot: number; spin: number; flip: number; flipRate: number; size: number; depth: number; sway: number; swayRate: number; sprite: number }

/** A five-lobed sakura petal is one notched lobe: the notch at the tip is what makes it read as sakura. */
function petalPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  ctx.moveTo(16, 30)
  ctx.bezierCurveTo(5, 26, 2, 13, 9, 4)
  ctx.quadraticCurveTo(12.5, 1.5, 16, 6.5)
  ctx.quadraticCurveTo(19.5, 1.5, 23, 4)
  ctx.bezierCurveTo(30, 13, 27, 26, 16, 30)
  ctx.closePath()
}
const css = (c: number | string) => (typeof c === 'number' ? `#${c.toString(16).padStart(6, '0')}` : c)
function sprite(color: number | string, back: boolean) {
  const c = document.createElement('canvas')
  c.width = c.height = SPRITE * 2
  const ctx = c.getContext('2d')!
  ctx.scale(2, 2)
  petalPath(ctx)
  ctx.fillStyle = css(color)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-atop'
  const g = ctx.createLinearGradient(16, 30, 16, 3)
  g.addColorStop(0, 'transparent'); g.addColorStop(1, back ? 'black' : 'white')
  ctx.globalAlpha = back ? 0.12 : 0.7
  ctx.fillStyle = back ? 'black' : g
  ctx.fillRect(0, 0, SPRITE, SPRITE)
  ctx.globalAlpha = back ? 0.14 : 0.18
  ctx.strokeStyle = 'black'
  ctx.lineWidth = 0.7
  ctx.beginPath(); ctx.moveTo(16, 29); ctx.quadraticCurveTo(15, 18, 16, 8); ctx.stroke()
  return c
}

export function PetalWind({ count = 36, colors = [0xffd9e2, 0xf8b9c9, 0xfff0f3, 0xf4a7bb], breeze = 22, fall = 46, stir = 1, source, trigger, paused, className }: PetalWindProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const live = useRef({ breeze, fall, stir, source, paused, gust: 0 })
  live.current = { ...live.current, breeze, fall, stir, source, paused }
  const first = useRef(true), kick = useRef(() => {}), sprites = useRef<HTMLCanvasElement[]>([])
  const tint = colors.map(String).join()
  useEffect(() => { sprites.current = colors.flatMap(color => [sprite(color, false), sprite(color, true)]) }, [tint]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (first.current) { first.current = false; return } live.current.gust = 1 }, [trigger])
  useEffect(() => kick.current(), [paused])

  useEffect(() => {
    const canvas = ref.current!, host = canvas.parentElement!, ctx = canvas.getContext('2d')!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, cols = 0, rows = 0, air = new Float32Array(0)
    let seen = true, raf = 0, last = 0, time = 0
    const pointer = { x: 0, y: 0, t: 0, on: false }
    // The host's box is cached (resize and scroll refresh it): reading layout on every move forces a reflow.
    let hostBox = host.getBoundingClientRect()
    const rebox = () => { hostBox = host.getBoundingClientRect() }
    const rand = (a: number, b: number) => a + Math.random() * (b - a)
    const box = () => live.current.source?.() ?? { x: 0, y: -24, w, h: 1 }
    function born(p: Petal, anywhere: boolean) {
      const b = anywhere ? { x: 0, y: 0, w, h } : box()
      p.x = rand(b.x, b.x + b.w); p.y = rand(b.y, b.y + b.h)
      p.vx = -live.current.breeze * p.depth * 0.5; p.vy = rand(0, 12)
      p.rot = rand(0, TAU); p.spin = rand(-1.6, 1.6); p.flip = rand(0, TAU); p.flipRate = rand(1.4, 3.4)
      p.sway = rand(0, TAU); p.swayRate = rand(0.7, 1.6)
    }
    // Far petals first, so near ones draw over them; a slot keeps its depth when it is reborn.
    const petals: Petal[] = Array.from({ length: count }, (_, i) => ({ depth: 0.55 + (0.7 * i) / Math.max(1, count - 1), size: 0, sprite: i % colors.length } as Petal))
    for (const p of petals) p.size = rand(9, 14) * p.depth

    function resize() {
      const r = host.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1)
      w = r.width; h = r.height
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(w / CELL) + 1; rows = Math.ceil(h / CELL) + 1; air = new Float32Array(cols * rows * 2)
    }
    function wind(x: number, y: number) {
      const gx = Math.max(0, Math.min(cols - 1.001, x / CELL)), gy = Math.max(0, Math.min(rows - 1.001, y / CELL))
      const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j
      const at = (a: number, b: number, k: number) => air[(b * cols + a) * 2 + k]
      const mix = (k: number) => (at(i, j, k) * (1 - fx) + at(i + 1, j, k) * fx) * (1 - fy) + (at(i, j + 1, k) * (1 - fx) + at(i + 1, j + 1, k) * fx) * fy
      return [mix(0), mix(1)]
    }
    function move(e: PointerEvent) {
      const x = e.clientX - hostBox.left, y = e.clientY - hostBox.top, t = e.timeStamp / 1000
      const dt = Math.max(1 / 240, t - pointer.t)
      if (pointer.on && dt < 0.1 && live.current.stir > 0) {
        const cap = 900, vx = Math.max(-cap, Math.min(cap, (x - pointer.x) / dt)), vy = Math.max(-cap, Math.min(cap, (y - pointer.y) / dt))
        const reach = 110 * live.current.stir, k = 0.35 * live.current.stir
        for (let b = Math.max(0, Math.floor((y - reach) / CELL)); b <= Math.min(rows - 1, Math.ceil((y + reach) / CELL)); b++)
          for (let a = Math.max(0, Math.floor((x - reach) / CELL)); a <= Math.min(cols - 1, Math.ceil((x + reach) / CELL)); a++) {
            const d = Math.hypot(a * CELL - x, b * CELL - y) / reach
            if (d >= 1) continue
            const f = (1 - d) * (1 - d) * k, n = (b * cols + a) * 2
            air[n] += (vx - air[n]) * f; air[n + 1] += (vy - air[n + 1]) * f
          }
      }
      pointer.x = x; pointer.y = y; pointer.t = t; pointer.on = true
    }
    const leave = () => { pointer.on = false }

    function step(dt: number) {
      time += dt
      const decay = Math.exp(-dt * 1.6)
      for (let n = 0; n < air.length; n++) air[n] *= decay
      const L = live.current
      const g = L.gust > 0 ? Math.sin(Math.PI * (1 - L.gust)) : 0
      if (L.gust > 0) L.gust = Math.max(0, L.gust - dt / 1.6)
      for (const p of petals) {
        const [wx, wy] = wind(p.x, p.y)
        const stirred = Math.hypot(wx, wy)
        const flat = Math.abs(Math.cos(p.flip))
        const ax = -L.breeze * p.depth * (0.65 + 0.35 * Math.sin(time * 0.31 + p.y * 0.012)) + Math.sin(time * p.swayRate + p.sway) * 16 + wx - g * 260 * p.depth
        const ay = L.fall * p.depth * (1 - 0.45 * flat) + Math.cos(time * p.swayRate * 1.3 + p.sway) * 7 + wy - g * 40
        const k = Math.min(1, (1.1 + 2.2 * flat) * dt)
        p.vx += (ax - p.vx) * k; p.vy += (ay - p.vy) * k
        p.x += p.vx * dt; p.y += p.vy * dt
        p.rot += (p.spin + (wx + g * 200) * 0.004) * dt
        p.flip += p.flipRate * dt * (1 + stirred * 0.004 + g * 1.5)
        if (p.y > h + 24 || p.x < -48 || p.x > w + 48 || p.y < -80) born(p, false)
      }
    }
    function draw() {
      ctx.clearRect(0, 0, w, h)
      for (const p of petals) {
        const c = Math.cos(p.flip), s = p.size / SPRITE
        ctx.save()
        ctx.globalAlpha = 0.5 + 0.45 * (p.depth - 0.55) / 0.7
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(s, s * Math.max(0.08, Math.abs(c)))
        const art = sprites.current[(p.sprite % (sprites.current.length / 2)) * 2 + (c < 0 ? 1 : 0)]
        if (art) ctx.drawImage(art, -SPRITE / 2, -SPRITE / 2, SPRITE, SPRITE)
        ctx.restore()
      }
    }
    function frame(now: number) {
      raf = 0
      const dt = Math.min(1 / 20, last ? (now - last) / 1000 : 0)
      last = now
      step(dt); draw()
      schedule()
    }
    function schedule() {
      const run = seen && !live.current.paused && document.visibilityState === 'visible'
      if (run && !raf) raf = requestAnimationFrame(frame)
      if (!run) last = 0
    }

    resize()
    for (const p of petals) born(p, true)
    draw()
    if (reduced) return
    const ro = new ResizeObserver(() => { resize(); rebox(); draw() })
    ro.observe(host)
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; schedule() })
    io.observe(host)
    const vis = () => schedule()
    document.addEventListener('visibilitychange', vis)
    host.addEventListener('pointermove', move, { passive: true })
    host.addEventListener('pointerleave', leave)
    host.addEventListener('pointerenter', rebox)
    addEventListener('scroll', rebox, { passive: true })
    kick.current = schedule
    schedule()
    return () => { cancelAnimationFrame(raf); kick.current = () => {}; ro.disconnect(); io.disconnect(); document.removeEventListener('visibilitychange', vis); host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave); host.removeEventListener('pointerenter', rebox); removeEventListener('scroll', rebox) }
    // ponytail: count is read once; remount (key) to change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={ref} className={className ? `k-petals ${className}` : 'k-petals'} aria-hidden="true" />
}
