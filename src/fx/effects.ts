// Every effect as data: defaults, presets and knobs from rune-fx (params.rs, fill.rs, catalog.rs; MIT,
// Anomaly), and `pack`, which writes a layer into the shader slots the way pack.rs does. The knobs drive
// the components page; `pack` drives the engine. One definition per effect, nothing else to keep in step.
import * as cpu from './cpu'
import type { Rect, Table } from './cpu'

export type Family = 'glow' | 'pulse' | 'electric' | 'fire' | 'extras' | 'distort' | 'fill' | 'weather' | 'light'
type V4 = [number, number, number, number]
export type Value = number | boolean | string | number[] | [number, number]
export type Params = Record<string, Value>
export type Inst = { rect: V4; shape: V4; c0: V4; c1: V4; c2: V4; p0: V4; p1: V4; p2: V4; p3: V4; t: V4; aux: V4; aux2: V4; xf: V4 }
export type Occluder = { x: number; y: number; w: number; h: number; radius: number; height: number }
/** What the engine knows about a layer this frame. Lengths are points (CSS px). */
export type Frame = { rect: Rect; radius: number; time: number; seed: number; reduced: boolean; skyline?: number[]; occluders?: Occluder[]; pointer?: [number, number]; mips?: boolean }
export type Packed = { family: Family; inst: Inst; data: Table }
export type Knob =
  | { kind: 'number'; id: string; label: string; min: number; max: number; step: number }
  | { kind: 'color'; id: string; label: string }
  | { kind: 'colors'; id: string; label: string }
  | { kind: 'choice'; id: string; label: string; options: [string, string][] }
  | { kind: 'toggle'; id: string; label: string }
export type EffectDef = {
  id: string; name: string; group: 'Effects' | 'Fills' | 'Weather' | 'Light'; family: Family
  summary: string; source: string
  reads?: 'backdrop' | 'source'
  defaults: Params; presets: Record<string, Params>; knobs: Knob[]
  /** How far past the element the layer draws: (left, top, right, bottom) in points. */
  reach: (p: Params, rect: Rect) => V4
  pack: (p: Params, f: Frame) => Packed | null
}

/** Reduced motion: looping noise effects freeze on this calm pose. */
export const CALM_T = 2.37
const num = (v: Value | undefined, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'boolean' ? Number(v) : d)
const col = (v: Value | undefined): V4 => { const c = cpu.linear(num(v)); return [c[0], c[1], c[2], 1] }
const list = (v: Value | undefined) => (Array.isArray(v) ? (v as number[]) : [])
const blank = (f: Frame, opacity = 1): Inst => ({
  rect: [f.rect.x, f.rect.y, f.rect.w, f.rect.h], shape: [Math.max(0, Math.min(f.radius, f.rect.w / 2, f.rect.h / 2)), 1, opacity, 0],
  c0: [0, 0, 0, 0], c1: [0, 0, 0, 0], c2: [0, 0, 0, 0], p0: [0, 0, 0, 0], p1: [0, 0, 0, 0], p2: [0, 0, 0, 0], p3: [0, 0, 0, 0],
  t: [f.time, f.seed % 65536, 0, f.reduced ? 1 : 0], aux: [0, 0, 0, 0], aux2: [0, 0, 1, 1], xf: [0, 0, 0, 0],
})
const even = (m: number): V4 => [m, m, m, m]
const n = (id: string, label: string, min: number, max: number, step = 0.01): Knob => ({ kind: 'number', id, label, min, max, step })
const c = (id: string, label: string): Knob => ({ kind: 'color', id, label })
const cs = (id: string, label = 'Colours'): Knob => ({ kind: 'colors', id, label })
const ch = (id: string, label: string, options: [string, string][]): Knob => ({ kind: 'choice', id, label, options })
const tog = (id: string, label: string): Knob => ({ kind: 'toggle', id, label })
const RAD = Math.PI

// ---------------------------------------------------------------- light-emitting effects
const glowStyles = { soft: 0, neon: 1, aura: 2, mask: 3 } as const
const glow: EffectDef = {
  id: 'glow', name: 'Glow', group: 'Effects', family: 'glow', source: 'crates/rune-fx/src/shaders/glow.wgsl',
  summary: 'Bloom around a shape: a soft breathing halo, neon that cools instead of cutting off, a spectrum flowing round the border, or text bloom from a mask.',
  defaults: { style: 'soft', color: 0x7c5cff, core: 0xf4f0ff, third: 0x22d3ee, radius: 14, intensity: 1, inner: 0, occlusion: 0.15, breathe: 0, breathePeriod: 2.6, heat: 1, hot: 0.6, auraSpeed: 0.12, rimWidth: 0.6, reach: 4.5 },
  presets: {
    Soft: { style: 'soft', breathe: 0.6 },
    Neon: { style: 'neon', color: 0x22d3ee, core: 0xeafcff, radius: 12, intensity: 1.15, inner: 0.35 },
    Aura: { style: 'aura', color: 0x7c5cff, core: 0xff5fa2, third: 0x22d3ee, radius: 16, inner: 0.4, hot: 0.5 },
    'Hot core': { style: 'soft', color: 0xff8a3d, core: 0xfff1d6, radius: 10, intensity: 1.4, hot: 1 },
  },
  knobs: [ch('style', 'Style', [['soft', 'Soft'], ['neon', 'Neon'], ['aura', 'Aura']]), c('color', 'Colour'), c('core', 'Hot core'), c('third', 'Third'), n('radius', 'Radius', 1, 64, 0.5), n('intensity', 'Intensity', 0, 3), n('inner', 'Inner', 0, 1), n('occlusion', 'Occlusion', 0, 1), n('breathe', 'Breathe', 0, 1), n('breathePeriod', 'Breathe period', 0.4, 8), n('heat', 'Heat', 0, 1), n('hot', 'Hot', 0, 1), n('auraSpeed', 'Aura speed', 0, 1), n('rimWidth', 'Rim width', 0.2, 3), n('reach', 'Reach', 2, 8)],
  reach: p => even(num(p.radius) * num(p.reach) * (1 + 0.22 * num(p.breathe))),
  pack: (p, f) => {
    if (num(p.intensity) <= 0 || num(p.heat) <= 0) return null
    const i = blank(f)
    i.t[2] = glowStyles[p.style as keyof typeof glowStyles] ?? 0
    i.c0 = col(p.color); i.c1 = col(p.core); i.c2 = col(p.third)
    i.p0 = [num(p.radius), num(p.intensity), num(p.inner), num(p.occlusion)]
    i.p1 = [num(p.breathe), num(p.breathePeriod), Math.max(0, Math.min(1, num(p.heat))), num(p.hot)]
    i.p2 = [num(p.auraSpeed), num(p.rimWidth), num(p.reach), 0]
    i.aux2 = [f.rect.x, f.rect.y, f.rect.w, f.rect.h]
    return { family: 'glow', inst: i, data: [] }
  },
}

const pulseStyles = { radar: 0, breathe: 1, heartbeat: 2, ping: 3, ripple: 4 } as const
export const PING_LIFE = 2.2
const pulse: EffectDef = {
  id: 'pulse', name: 'Pulse', group: 'Effects', family: 'pulse', source: 'crates/rune-fx/src/shaders/pulse.wgsl',
  summary: 'Light that beats: radar rings, a breathing halo, a heartbeat whose earlier rings keep fading under the new one, a ping that winds up, lands and cools, and a tap ripple.',
  defaults: { style: 'radar', color: 0x3b82f6, core: 0xe8f1ff, count: 3, period: 2.4, reach: 36, width: 1.6, intensity: 1, t0: 0, dur: 0.75, repeat: 0, lag: 0.16, headRadius: 2.6, occlusion: 0.15, from: [0, 0.5], dir: [1, 0], travel: 160, at: [0.5, 0.5] },
  presets: {
    Radar: { style: 'radar', color: 0xef4444, core: 0xffe4e4 },
    Breathe: { style: 'breathe', color: 0x22c55e, core: 0xe6fff0, reach: 14, period: 2.8 },
    Heartbeat: { style: 'heartbeat', color: 0xf43f5e, core: 0xffe4ea, reach: 30, period: 1.1 },
    Ping: { style: 'ping', color: 0x60a5fa, core: 0xeaf3ff, repeat: 2.2, dur: 0.75 },
  },
  knobs: [ch('style', 'Style', [['radar', 'Radar'], ['breathe', 'Breathe'], ['heartbeat', 'Heartbeat'], ['ping', 'Ping'], ['ripple', 'Ripple']]), c('color', 'Colour'), c('core', 'Core'), n('count', 'Rings', 1, 6, 1), n('period', 'Period', 0.3, 6), n('reach', 'Reach', 4, 200, 1), n('width', 'Width', 0.3, 8), n('intensity', 'Intensity', 0, 3), n('dur', 'Duration', 0.1, 3), n('repeat', 'Repeat', 0, 6), n('lag', 'Lag', 0.02, 0.5), n('headRadius', 'Head radius', 0.5, 12, 0.1), n('travel', 'Travel', 20, 600, 1), n('occlusion', 'Occlusion', 0, 1)],
  reach: (p, r) => {
    const s = p.style
    if (s === 'radar') return even(num(p.reach) + num(p.width) * 12.8)
    if (s === 'breathe') return even(num(p.reach) * 5)
    if (s === 'heartbeat') return even(num(p.reach) + num(p.width) * 16 + 2)
    if (s === 'ping') { const m = num(p.headRadius) * 10 + 30, d = list(p.dir), fr = list(p.from), t = num(p.travel); const x0 = r.x + r.w * (fr[0] ?? 0), y0 = r.y + r.h * (fr[1] ?? 0.5); const x1 = x0 + (d[0] ?? 1) * t, y1 = y0 + (d[1] ?? 0) * t; return [Math.max(0, r.x - Math.min(x0, x1) + m), Math.max(0, r.y - Math.min(y0, y1) + m), Math.max(0, Math.max(x0, x1) + m - r.x - r.w), Math.max(0, Math.max(y0, y1) + m - r.y - r.h)] }
    return even(1)
  },
  pack: (p, f) => {
    const i = blank(f), r = f.rect
    const style = (p.style as keyof typeof pulseStyles) ?? 'radar'
    i.t[2] = pulseStyles[style] ?? 0
    i.c0 = col(p.color); i.c1 = col(p.core)
    i.p0 = [num(p.count), num(p.period), num(p.reach), num(p.width)]
    i.p1 = [num(p.intensity), num(p.t0), num(p.dur), num(p.repeat)]
    i.p2 = [0, num(p.lag), num(p.headRadius), num(p.occlusion)]
    if (style === 'ping') {
      if (num(p.repeat) <= 0 && (f.time < num(p.t0) || f.time > num(p.t0) + num(p.dur) * PING_LIFE)) return null
      const d = list(p.dir), l = Math.hypot(d[0] ?? 1, d[1] ?? 0) || 1, fr = list(p.from)
      i.aux = [r.x + r.w * (fr[0] ?? 0), r.y + r.h * (fr[1] ?? 0.5), (d[0] ?? 1) / l, (d[1] ?? 0) / l]
      i.p2[0] = num(p.travel)
    }
    if (style === 'ripple') {
      if (f.time < num(p.t0) || f.time > num(p.t0) + num(p.dur)) return null
      const a = list(p.at), ax = r.x + r.w * (a[0] ?? 0.5), ay = r.y + r.h * (a[1] ?? 0.5)
      i.aux = [ax, ay, 0, 0]
      i.p0[2] = Math.max(...[[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].map(([x, y]) => Math.hypot(x - ax, y - ay)))
    }
    return { family: 'pulse', inst: i, data: [] }
  },
}

const electricStyles = { arc: 0, border: 1, charged: 2 } as const
const electricP = (p: Params, r: Rect): cpu.ElectricP => {
  const a = list(p.a), b = list(p.b)
  return { style: (p.style as cpu.ElectricP['style']) ?? 'border', a: [r.x + r.w * (a[0] ?? 0), r.y + r.h * (a[1] ?? 0.5)], b: [r.x + r.w * (b[0] ?? 1), r.y + r.h * (b[1] ?? 0.5)], amplitude: num(p.amplitude), frequency: num(p.frequency), speed: num(p.speed), glow: num(p.glow), forks: num(p.forks), flicker: num(p.flicker), strands: num(p.strands), forkLen: num(p.forkLen), zap: typeof p.zap === 'number' && p.zap >= 0 ? p.zap : null }
}
const electric: EffectDef = {
  id: 'electricity', name: 'Electricity', group: 'Effects', family: 'electric', source: 'crates/rune-fx/src/shaders/electric.wgsl',
  summary: 'Lightning that strikes, holds and re-strikes down the same channel: an arc between two points with forks that shoot out and cool, a current round a border, or a calm charged hairline for UI.',
  defaults: { style: 'border', color: 0x4f8dff, core: 0xeaf3ff, cool: 0x7a4dff, amplitude: 5, frequency: 2.4, speed: 3.2, coreWidth: 0.6, intensity: 1, glow: 5, forks: 0.55, flicker: 0.45, strands: 2, gap: 2, forkLen: 20, occlusion: 0.12, a: [0, 0.5], b: [1, 0.5], zap: -1 },
  presets: {
    'Border current': { style: 'border' },
    Charged: { style: 'charged', amplitude: 1.1, frequency: 3, speed: 2, coreWidth: 0.5, glow: 4, forks: 0.25, flicker: 0, strands: 1, gap: 0.5, forkLen: 14, intensity: 0.9 },
    Arc: { style: 'arc', amplitude: 9, glow: 6, strands: 2 },
  },
  knobs: [ch('style', 'Style', [['border', 'Border'], ['charged', 'Charged'], ['arc', 'Arc']]), c('color', 'Glow'), c('core', 'Core'), c('cool', 'Cooled fork'), n('amplitude', 'Amplitude', 0, 24, 0.1), n('frequency', 'Frequency', 0.5, 8), n('speed', 'Speed', 0, 10), n('coreWidth', 'Core width', 0.2, 3), n('intensity', 'Intensity', 0, 3), n('glow', 'Glow', 1, 20, 0.1), n('forks', 'Forks', 0, 1), n('flicker', 'Flicker', 0, 1), n('strands', 'Strands', 1, 3, 1), n('gap', 'Gap', -6, 12, 0.1), n('forkLen', 'Fork length', 2, 60, 0.5), n('occlusion', 'Occlusion', 0, 1)],
  reach: (p, r) => {
    const m = num(p.amplitude) * 1.7 + num(p.glow) * 5
    if (p.style === 'arc') { const e = electricP(p, r); return even(num(p.glow) * 5 + num(p.coreWidth) * 3 + cpu.arcReach(e, Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]))) }
    return even(m + Math.max(num(p.gap), 0) + num(p.forkLen) * (p.style === 'charged' ? 0.6 : 1.3))
  },
  pack: (p, f) => {
    const i = blank(f)
    const e = electricP(p, f.rect)
    const t = f.reduced ? CALM_T : f.time
    if (e.zap !== null && (f.time < e.zap || f.time > e.zap + cpu.ZAP_LIFE)) return null
    i.t[0] = e.zap !== null ? f.time : t
    i.t[2] = electricStyles[e.style]
    i.c0 = col(p.color); i.c1 = col(p.core); i.c2 = col(p.cool)
    i.p0 = [e.amplitude, e.frequency, e.speed, num(p.coreWidth)]
    i.p1 = [num(p.intensity), e.glow, e.forks, e.flicker]
    i.p2 = [Math.max(1, Math.min(3, e.strands)), num(p.gap), e.forkLen, num(p.occlusion)]
    if (e.style === 'arc') i.aux = [e.a[0], e.a[1], e.b[0], e.b[1]]
    const data: Table = []
    i.xf = cpu.electric(e, f.rect, i.shape[0], i.t[0], f.seed, f.reduced, data)
    return { family: 'electric', inst: i, data }
  },
}

const fireStyles = { top: 0, border: 1, heat: 0, embers: 3 } as const
const fire: EffectDef = {
  id: 'fire', name: 'Fire', group: 'Effects', family: 'fire', source: 'crates/rune-fx/src/shaders/fire.wgsl',
  summary: 'Flames off a top edge with embers that are flung up, slow to a buoyant drift and cool from white to red; plasma hugging a border; or a little heat for a button.',
  defaults: { style: 'top', low: 0x8a1405, mid: 0xff5a14, hot: 0xffc65a, height: 54, scale: 20, speed: 1.5, intensity: 1, embers: 16, emberRise: 58, emberSize: 0.8, emberLife: 1.5, warp: 1, sides: 0.32, baseGlow: 0.5, occlusion: 0.25, swirl: 0 },
  presets: {
    Flames: { style: 'top' },
    Heat: { style: 'heat', low: 0x7a1606, mid: 0xf0601a, hot: 0xffc062, height: 15, scale: 7, speed: 1.3, intensity: 0.8, embers: 4, emberRise: 30, emberSize: 0.55, emberLife: 1.1, warp: 0.8, baseGlow: 0.35, occlusion: 0.1 },
    Plasma: { style: 'border', low: 0x3a1690, mid: 0x7b5cff, hot: 0x9fe8ff, height: 30, scale: 16, speed: 1.1, intensity: 0.95, embers: 0, sides: 0.55, baseGlow: 0.6, swirl: 0.8 },
  },
  knobs: [ch('style', 'Style', [['top', 'Flames'], ['heat', 'Heat'], ['border', 'Plasma'], ['embers', 'Embers only']]), c('low', 'Low'), c('mid', 'Mid'), c('hot', 'Hot'), n('height', 'Height', 4, 160, 1), n('scale', 'Scale', 4, 80, 0.5), n('speed', 'Speed', 0, 5), n('intensity', 'Intensity', 0, 3), n('embers', 'Embers', 0, 40, 1), n('emberRise', 'Ember rise', 0, 200, 1), n('emberSize', 'Ember size', 0.2, 3), n('emberLife', 'Ember life', 0.2, 4), n('warp', 'Warp', 0, 3), n('sides', 'Sides', 0, 1), n('baseGlow', 'Base glow', 0, 2), n('swirl', 'Swirl', 0, 3), n('occlusion', 'Occlusion', 0, 1)],
  reach: p => {
    if (p.style === 'border') return even(Math.max(num(p.height) * num(p.sides) * 0.3, 2.5) * 4.6 + 2)
    const embers = num(p.embers) > 0
    const life = Math.max(num(p.emberLife), 0.1) * 1.4
    const up = embers ? num(p.height) * 0.55 + num(p.emberRise) * (1.48 / cpu.EMBER_DRAG + 0.32 * life) + num(p.emberSize) * 4 : 0
    const side = embers ? 7.5 * life + 9 : 0
    return [side, Math.max(num(p.height) * 2.6 + 8, up) + 4, side, 4]
  },
  pack: (p, f) => {
    const i = blank(f)
    i.t[0] = f.reduced ? CALM_T : f.time
    i.t[2] = fireStyles[p.style as keyof typeof fireStyles] ?? 0
    i.c0 = col(p.low); i.c1 = col(p.mid); i.c2 = col(p.hot)
    i.p0 = [num(p.height), num(p.scale), num(p.speed), num(p.intensity)]
    i.p1 = [f.reduced ? 0 : Math.min(num(p.embers), 40), num(p.emberRise), num(p.emberSize), num(p.emberLife)]
    i.p2 = [num(p.warp), num(p.sides), num(p.baseGlow), num(p.occlusion)]
    i.p3 = [num(p.swirl), 0, 0, 0]
    const data: Table = []
    if (!f.reduced && num(p.embers) > 0) { const [first, count] = cpu.embers({ height: num(p.height), emberRise: num(p.emberRise), emberSize: num(p.emberSize), emberLife: num(p.emberLife), embers: num(p.embers) }, f.rect, i.shape[0], i.t[0], f.seed, data); i.xf = [first, count, 0, 0] }
    return { family: 'fire', inst: i, data }
  },
}

// ---------------------------------------------------------------- extras
const shimmer: EffectDef = {
  id: 'shimmer', name: 'Shimmer', group: 'Effects', family: 'extras', source: 'crates/rune-fx/src/shaders/extras.wgsl',
  summary: 'A band of light sweeping across a shape: a skeleton shimmer while content loads, or a sheen across text that is still thinking. Under reduced motion the surface breathes instead.',
  defaults: { color: 0xffffff, base: 0x1c1f26, baseAlpha: 0, period: 1.8, band: 28, angle: 0.35, intensity: 0.16, useMask: false, pause: 0.3, feather: 0 },
  presets: { Skeleton: {}, 'Text sheen': { useMask: true, intensity: 0.9, band: 18, period: 2.2 } },
  knobs: [c('color', 'Sheen'), c('base', 'Base'), n('baseAlpha', 'Base alpha', 0, 1), n('period', 'Period', 0.4, 6), n('band', 'Band', 4, 120, 1), n('angle', 'Angle', -1.2, 1.2), n('intensity', 'Intensity', 0, 1.5), n('pause', 'Pause', 0, 0.9), n('feather', 'Feather', 0, 12, 0.5)],
  reach: () => even(1),
  pack: (p, f) => {
    const i = blank(f)
    i.c0 = col(p.color); const b = col(p.base); i.c1 = [b[0], b[1], b[2], num(p.baseAlpha)]
    i.p0 = [num(p.period), num(p.band), num(p.angle), num(p.intensity)]
    i.p1 = [p.useMask ? 1 : 0, num(p.pause), num(p.feather), 0]
    i.aux2 = [f.rect.x, f.rect.y, f.rect.w, f.rect.h]
    return { family: 'extras', inst: i, data: [] }
  },
}
const sparkles: EffectDef = {
  id: 'sparkles', name: 'Sparkles', group: 'Effects', family: 'extras', source: 'crates/rune-fx/src/shaders/extras.wgsl',
  summary: 'Four-point stars round a shape, each with its own size, twinkle and spin, taking turns. A burst pops every star once and flings it out a little.',
  defaults: { color: 0xffe6a8, count: 6, life: 1.5, size: 7, intensity: 1, margin: 10, burst: -1 },
  presets: { Twinkle: {}, Burst: { count: 14, burst: 0, size: 6, margin: 14 } },
  knobs: [c('color', 'Colour'), n('count', 'Count', 1, 64, 1), n('life', 'Life', 0.3, 4), n('size', 'Size', 2, 20, 0.5), n('intensity', 'Intensity', 0, 2), n('margin', 'Margin', 0, 40, 1)],
  reach: p => even(num(p.margin) + num(p.size) * cpu.SPARKLE_MAX_SCALE + 2),
  pack: (p, f) => {
    const burst = num(p.burst, -1) >= 0 ? num(p.burst) : null
    if (burst !== null && (f.time < burst || f.time > burst + cpu.SPARKLE_STAGGER + num(p.life) * cpu.BURST_LIFE * 1.3)) return null
    const i = blank(f)
    i.t[2] = 1; i.c0 = col(p.color)
    i.p0 = [Math.min(num(p.count), 64), num(p.life), num(p.size), num(p.intensity)]
    i.p1 = [num(p.margin), 0, 0, 0]
    const data: Table = []
    const [first, count] = cpu.sparkles({ count: num(p.count), life: num(p.life), size: num(p.size), margin: num(p.margin), burst }, f.rect, f.time, f.seed, f.reduced, data)
    i.xf = [first, count, 0, 0]
    return { family: 'extras', inst: i, data }
  },
}
const aurora: EffectDef = {
  id: 'aurora', name: 'Aurora', group: 'Effects', family: 'extras', source: 'crates/rune-fx/src/shaders/extras.wgsl',
  summary: 'Three curtains of light with bright lower hems, swaying across a surface. Their heights and warps are a CPU table per frame; the rays are noise per pixel.',
  defaults: { a: 0x16c79a, b: 0x3b6cff, c: 0xa23bff, scale: 120, speed: 0.25, intensity: 0.5, feather: 40 },
  presets: { Polar: {}, Ember: { a: 0xff6b3d, b: 0xc2185b, c: 0x5b2a86, intensity: 0.45 } },
  knobs: [c('a', 'First'), c('b', 'Second'), c('c', 'Third'), n('scale', 'Scale', 20, 400, 1), n('speed', 'Speed', 0, 2), n('intensity', 'Intensity', 0, 1.5), n('feather', 'Feather', 0, 120, 1)],
  reach: () => even(1),
  pack: (p, f) => {
    const i = blank(f)
    i.t[2] = 2; i.c0 = col(p.a); i.c1 = col(p.b); i.c2 = col(p.c)
    i.p0 = [num(p.scale), num(p.speed), num(p.intensity), num(p.feather)]
    const data: Table = []
    i.xf = [cpu.aurora(num(p.scale), num(p.speed), f.rect, f.reduced ? CALM_T : f.time, f.seed, data), cpu.AURORA_SAMPLES, 0, 0]
    return { family: 'extras', inst: i, data }
  },
}
const grain: EffectDef = {
  id: 'grain', name: 'Grain', group: 'Effects', family: 'extras', source: 'crates/rune-fx/src/shaders/extras.wgsl',
  summary: 'Film grain: triangular noise per pixel that lightens and darkens, static or redrawn a few times a second.',
  defaults: { amount: 0.05, fps: 0, feather: 0 },
  presets: { Static: {}, Film: { amount: 0.08, fps: 12 } },
  knobs: [n('amount', 'Amount', 0, 0.3, 0.005), n('fps', 'Rate', 0, 30, 1), n('feather', 'Feather', 0, 40, 1)],
  reach: () => even(1),
  pack: (p, f) => { const i = blank(f); i.t[2] = 3; i.p0 = [num(p.amount), num(p.fps), num(p.feather), 0]; return { family: 'extras', inst: i, data: [] } },
}

// ---------------------------------------------------------------- distortion (reads the backdrop)
const distortDef = (id: string, name: string, variant: number, summary: string, defaults: Params, knobs: Knob[], set: (i: Inst, p: Params, f: Frame) => boolean | void, reach: (p: Params) => V4, presets: Record<string, Params> = { Default: {} }): EffectDef => ({
  id, name, group: 'Effects', family: 'distort', reads: 'backdrop', source: 'crates/rune-fx/src/shaders/distort.wgsl', summary, defaults, presets, knobs, reach,
  pack: (p, f) => { const i = blank(f); i.t[2] = variant; if (set(i, p, f) === false) return null; return { family: 'distort', inst: i, data: [] } },
})
const heatHaze = distortDef('heat-haze', 'Heat haze', 0, 'Hot air rising off an edge: the backdrop wobbles in a column above it, strongest a little up where the air has risen.',
  { height: 34, scale: 14, speed: 1.4, amount: 2.6, wholeShape: false }, [n('height', 'Height', 4, 160, 1), n('scale', 'Scale', 4, 60, 0.5), n('speed', 'Speed', 0, 5), n('amount', 'Amount', 0, 12, 0.1), tog('wholeShape', 'Whole shape')],
  (i, p, f) => { i.t[0] = f.reduced ? CALM_T : f.time; i.p0 = [num(p.height), num(p.scale), num(p.speed), num(p.amount)]; i.p1 = [p.wholeShape ? 1 : 0, 0, 0, 0] },
  p => p.wholeShape ? even(num(p.amount) + 2) : [4, num(p.height) + 4, 4, 8])
const shockwave = distortDef('shockwave', 'Shockwave', 1, 'A ring of displaced light expanding from a point, with a little chromatic split on its front. A one-shot.',
  { at: [0.5, 0.5], reach: 160, width: 14, amount: 9, chroma: 0.35, t0: 0, dur: 0.9 }, [n('reach', 'Reach', 20, 400, 1), n('width', 'Width', 2, 40, 0.5), n('amount', 'Amount', 0, 30, 0.5), n('chroma', 'Chroma', 0, 1), n('dur', 'Duration', 0.2, 3)],
  (i, p, f) => { if (f.time < num(p.t0) || f.time > num(p.t0) + num(p.dur)) return false; const a = list(p.at); i.aux = [f.rect.x + f.rect.w * (a[0] ?? 0.5), f.rect.y + f.rect.h * (a[1] ?? 0.5), 0, 0]; i.p0 = [num(p.reach), num(p.width), num(p.amount), num(p.chroma)]; i.p1 = [num(p.t0), num(p.dur), 0, 0] },
  p => even(num(p.reach) + num(p.width) * 5 + num(p.amount)))
const lens = distortDef('lens', 'Liquid glass', 2, 'Glass that bends what is behind it: the rim squeezes the page, the middle stays sharp and colour splits only at the edge. Two lenses melt together like liquid.',
  { bevel: 14, depth: 16, dispersion: 0.14, magnification: 1.04, presence: 1, frost: 0, shadow: 0.35, rim: 1.6, lightAngle: -2.09, tint: 0xffffff, tintAmount: 0, unionK: 22, morph: 0 },
  [n('bevel', 'Bevel', 1, 40, 0.5), n('depth', 'Depth', 0, 40, 0.5), n('dispersion', 'Dispersion', 0, 0.6), n('magnification', 'Magnification', 0.8, 1.4), n('presence', 'Presence', 0, 1), n('frost', 'Frost', 0, 1), n('shadow', 'Shadow', 0, 1), n('rim', 'Rim', 0, 3), n('lightAngle', 'Light angle', -RAD, RAD), c('tint', 'Tint'), n('tintAmount', 'Tint amount', 0, 1)],
  (i, p, f) => {
    i.c0 = col(p.tint)
    i.p0 = [num(p.bevel), num(p.depth), num(p.dispersion), num(p.magnification)]
    i.p1 = [Math.max(0, Math.min(1, num(p.presence))), num(p.frost), num(p.shadow), num(p.rim)]
    i.p2 = [num(p.lightAngle), num(p.tintAmount), 0, 0]
    const s = list(p.second)
    if (s.length === 5) { i.p2[2] = num(p.unionK); i.p2[3] = s[4]; i.p3 = [s[0], s[1], s[2], s[3]]; i.shape[3] = num(p.morph) }
    if (num(p.frost) > 0 && f.mips) i.xf = [1, 1, 0, 0]
  }, () => even(28))
const crt = distortDef('crt', 'CRT', 3, 'An old tube: the picture bulges, scanlines and an aperture grille cross it, a roll bar drifts down and colour bleeds sideways.',
  { bulge: 0.08, scanline: 1.5, scanDepth: 0.28, chroma: 0.8, vignette: 0.6, glow: 0.35, roll: 1, feather: 2 }, [n('bulge', 'Bulge', 0, 0.4), n('scanline', 'Scanline', 1, 6, 0.1), n('scanDepth', 'Scan depth', 0, 1), n('chroma', 'Chroma', 0, 4, 0.1), n('vignette', 'Vignette', 0, 1.5), n('glow', 'Glow', 0, 1.5), n('roll', 'Roll', 0, 3), n('feather', 'Feather', 0, 12, 0.5)],
  (i, p, f) => { i.t[0] = f.time; i.p0 = [num(p.bulge), num(p.scanline), num(p.scanDepth), num(p.chroma)]; i.p1 = [num(p.vignette), num(p.glow), num(p.roll), num(p.feather)] },
  p => even(num(p.feather)))
const split = distortDef('chroma-split', 'Chromatic split', 4, 'Red and blue pulled apart from green, with optional glitch slices that jump sideways a few frames at a time.',
  { offset: [2.2, 0], glitch: 0.6, feather: 2 }, [n('glitch', 'Glitch', 0, 2), n('feather', 'Feather', 0, 12, 0.5)],
  (i, p, f) => { const o = list(p.offset); i.t[0] = f.time; i.p0 = [o[0] ?? 2, o[1] ?? 0, num(p.glitch), num(p.feather)] },
  p => even(num(p.feather) + 10))

// ---------------------------------------------------------------- fills
const MESH_POINTS: [number, number][] = [[0.12, 0.18], [0.86, 0.12], [0.5, 0.55], [0.14, 0.9], [0.9, 0.86], [0.62, 0.3]]
const inputs: [string, string][] = [['linear', 'Linear'], ['radial', 'Radial'], ['noise', 'Noise'], ['backdrop', 'Backdrop']]
const inputCode = (v: Value) => ({ linear: 0, radial: 1, noise: 2, backdrop: 3, image: 4 } as Record<string, number>)[String(v)] ?? 0
const fillCommon: Knob[] = [n('border', 'Border', 0, 24, 0.5), n('intensity', 'Intensity', 0, 1)]
const fillDef = (id: string, name: string, variant: number, summary: string, defaults: Params, presets: Record<string, Params>, knobs: Knob[], set: (i: Inst, p: Params, f: Frame, data: Table) => void, reads?: 'backdrop'): EffectDef => ({
  id, name, group: 'Fills', family: 'fill', source: 'crates/rune-fx/src/shaders/fill.wgsl', summary, reads, presets,
  defaults: { border: 0, intensity: 1, ...defaults }, knobs: [...knobs, ...fillCommon], reach: () => even(0),
  pack: (p, f) => {
    if (num(p.intensity) <= 0) return null
    const i = blank(f), data: Table = []
    i.t[0] = f.reduced ? CALM_T : f.time; i.t[2] = variant
    i.aux = [num(p.border), Math.min(num(p.intensity), 1), 0, 0]
    set(i, p, { ...f, time: i.t[0] }, data)
    return { family: 'fill', inst: i, data }
  },
})
const stops = (i: Inst, p: Params, data: Table, pts?: [number, number][]) => { const [f0, k] = cpu.pushStops(data, list(p.colors), pts); i.xf = [f0, k, 0, 0] }
const liquidMetal = fillDef('liquid-metal', 'Liquid metal', 0, 'A polished conductor in a photo studio: a domed slab whose surface flows and pools, Fresnel to white at grazing angles, a little thin-film colour where it bends hardest.',
  { tint: 0xe9ecf0, light: 0xffffff, flow: 0.6, scale: 100, speed: 0.35, bevel: 14, dome: 0.55, angle: -0.12, iridescence: 0.08, contrast: 1, anchor: 'world' },
  { Chrome: {}, Gold: { tint: 0xf3c56b, light: 0xfff4dc, iridescence: 0 }, 'Rose gold': { tint: 0xf2b7a2, light: 0xfff0ea, iridescence: 0.05 }, Gunmetal: { tint: 0x8d949e, light: 0xe8f0ff, contrast: 1.35, iridescence: 0.12 } },
  [c('tint', 'Tint'), c('light', 'Light'), n('flow', 'Flow', 0, 1.5), n('scale', 'Scale', 16, 480, 1), n('speed', 'Speed', 0, 2), n('bevel', 'Bevel', 0, 48, 0.5), n('dome', 'Dome', 0, 1), n('angle', 'Angle', -RAD, RAD), n('iridescence', 'Iridescence', 0, 1), n('contrast', 'Contrast', 0.5, 2), ch('anchor', 'Anchor', [['world', 'World'], ['element', 'Element']])],
  (i, p) => { i.c0 = col(p.tint); i.c1 = col(p.light); i.p0 = [Math.max(0, num(p.flow)), Math.max(1, num(p.scale, 100)), num(p.speed), Math.max(0, num(p.bevel))]; i.p1 = [num(p.dome), num(p.angle), Math.max(0, num(p.iridescence)), Math.max(0.1, num(p.contrast, 1))]; i.p2 = [p.anchor === 'element' ? 1 : 0, 0, 0, 0] })
const mesh = fillDef('mesh-gradient', 'Mesh gradient', 1, 'Up to six colours, each owning a point that wanders; Shepard weights blend them in OKLab, so the middle never turns muddy.',
  { colors: [0x2b1b5a, 0xff6f91, 0xffc46b, 0x6a4cff, 0xff9a5a], drift: 0.12, speed: 0.25, sharpness: 1.6, warp: 0.35 },
  { Dusk: {}, Lagoon: { colors: [0x0b3d5c, 0x2ec4b6, 0xcbf3f0, 0x1b6ca8] }, Orchid: { colors: [0xf9d5e5, 0xc06c84, 0x6c5b7b, 0xf8b195, 0x355c7d, 0xeeac99], sharpness: 2 }, Graphite: { colors: [0x15171c, 0x3a3f4b, 0x8a93a3, 0x22262e], drift: 0.08, warp: 0.2 } },
  [cs('colors'), n('drift', 'Drift', 0, 0.4), n('speed', 'Speed', 0, 2), n('sharpness', 'Sharpness', 0.5, 4), n('warp', 'Warp', 0, 1)],
  (i, p, f, data) => { i.p0 = [num(p.drift), num(p.speed), Math.max(0.1, Math.min(8, num(p.sharpness))), num(p.warp)]; stops(i, p, data, cpu.meshPoints(MESH_POINTS.slice(0, list(p.colors).length), num(p.drift), num(p.speed), f.time, f.seed)) })
const ditherCodes: Record<string, number> = { bayer2: 1, bayer4: 2, bayer8: 3, blue: 4, white: 5 }
const dither = fillDef('dither', 'Dither', 2, 'Ordered dithering of a tone into a palette: Bayer matrices, a blue-noise tile built by void-and-cluster, or white noise, over a ramp, a radial, drifting noise or the backdrop.',
  { pattern: 'bayer4', input: 'linear', colors: [0x14161c, 0xe8e4d8], pixel: 2, angle: 0.6, scale: 90, speed: 0.2, bias: 0, contrast: 1 },
  { Bayer: {}, Handheld: { pattern: 'bayer8', input: 'noise', colors: [0x0f380f, 0x306230, 0x8bac0f, 0x9bbc0f], pixel: 3 }, 'Blue noise': { pattern: 'blue', input: 'radial', colors: [0x1b1530, 0xffd7a8], pixel: 1 }, Backdrop: { pattern: 'bayer4', input: 'backdrop', colors: [0x101418, 0xf2efe6], pixel: 2, contrast: 1.35, bias: -0.1 } },
  [ch('pattern', 'Pattern', [['bayer2', 'Bayer 2'], ['bayer4', 'Bayer 4'], ['bayer8', 'Bayer 8'], ['blue', 'Blue noise'], ['white', 'White noise']]), ch('input', 'Input', inputs), cs('colors'), n('pixel', 'Pixel', 0.5, 16, 0.5), n('angle', 'Angle', -RAD, RAD), n('scale', 'Noise scale', 8, 400, 1), n('speed', 'Speed', 0, 2), n('bias', 'Bias', -1, 1), n('contrast', 'Contrast', 0.2, 4)],
  (i, p, f, data) => {
    i.p0 = [ditherCodes[String(p.pattern)] ?? 2, inputCode(p.input), Math.max(0.25, num(p.pixel)), num(p.angle)]; i.p1 = [Math.max(1, num(p.scale)), num(p.speed), num(p.bias), num(p.contrast)]
    stops(i, p, data)
    if (p.pattern === 'blue') { i.xf[2] = cpu.at(data); i.xf[3] = cpu.BLUE_N; cpu.pushSamples(data, cpu.blueNoise()) }
  })
const grainGradient = fillDef('grain-gradient', 'Grain gradient', 3, 'A linear, radial or conic ramp whose position is scattered by triangular noise, so the colours stipple into each other like risograph ink.',
  { kind: 'linear', colors: [0x1a0b2e, 0xc2185b, 0xff8a3d, 0xffe1a8], angle: 1.2, center: [0.5, 0.5], amount: 0.4, size: 0.5, mono: true, fps: 12 },
  { Ember: {}, Halo: { kind: 'radial', colors: [0xe9f1ff, 0x7aa2ff, 0x2a2f7a, 0x0b0d1f], center: [0.5, 0.35] }, Sweep: { kind: 'conic', colors: [0x00c2a8, 0x3a86ff, 0x8338ec, 0xff006e, 0xffbe0b], angle: -1.57, mono: false } },
  [ch('kind', 'Kind', [['linear', 'Linear'], ['radial', 'Radial'], ['conic', 'Conic']]), cs('colors'), n('angle', 'Angle', -RAD, RAD), n('amount', 'Grain', 0, 1), n('size', 'Grain size', 0.5, 8, 0.25), tog('mono', 'Mono'), n('fps', 'Grain rate', 0, 30, 1)],
  (i, p, f, data) => { const ct = list(p.center); i.p0 = [({ linear: 0, radial: 1, conic: 2 } as Record<string, number>)[String(p.kind)] ?? 0, num(p.angle), ct[0] ?? 0.5, ct[1] ?? 0.5]; i.p1 = [num(p.amount), Math.max(0.25, num(p.size)), p.mono ? 1 : 0, f.reduced ? 0 : num(p.fps)]; stops(i, p, data) })
const fluted = fillDef('fluted-glass', 'Fluted glass', 4, 'Reeded glass: every rib is a cylindrical lens that returns the strip under it squeezed and flipped, with a sheen down the lit side and a shaded groove.',
  { rib: 14, angle: 0, refraction: 9, frost: 0, dispersion: 0.15, highlight: 0.5, tint: 0xffffff, tintAmount: 0 },
  { Reeded: {}, Fine: { rib: 6, refraction: 5 }, Frosted: { frost: 0.6 }, Wide: { rib: 32, refraction: 18, dispersion: 0.25 } },
  [n('rib', 'Rib width', 2, 64, 0.5), n('angle', 'Angle', -RAD, RAD), n('refraction', 'Refraction', 0, 40, 0.5), n('frost', 'Frost', 0, 1), n('dispersion', 'Dispersion', 0, 1), n('highlight', 'Highlight', 0, 1), c('tint', 'Tint'), n('tintAmount', 'Tint amount', 0, 1)],
  (i, p, f) => { i.c0 = col(p.tint); i.p0 = [Math.max(1, num(p.rib)), num(p.angle), num(p.refraction), num(p.frost)]; i.p1 = [num(p.dispersion), num(p.highlight), num(p.tintAmount), 0]; if (num(p.frost) > 0 && f.mips) i.xf = [1, 1, 0, 0] }, 'backdrop')
const metaballs = fillDef('metaballs', 'Metaballs', 5, 'Glossy blobs that drift and melt into each other where their fields add past the surface, each carrying its colour into the merge.',
  { colors: [0xff5e3a, 0xff9a3c, 0xff2d6f], base: 0x1a0f1f, count: 6, size: 0.2, speed: 0.4, gloss: 0.5 },
  { Lava: {}, Mint: { colors: [0x7cf2c4, 0x37d0e8, 0xb8f36b], base: 0x0d1b1e } },
  [cs('colors'), c('base', 'Base'), n('count', 'Count', 1, 8, 1), n('size', 'Size', 0.05, 0.5), n('speed', 'Speed', 0, 2), n('gloss', 'Gloss', 0, 1)],
  (i, p, f, data) => { i.c0 = col(p.base); i.p0 = [Math.max(1, Math.min(8, num(p.count))), num(p.size), num(p.speed), num(p.gloss)]; stops(i, p, data); i.xf[2] = cpu.at(data); i.xf[3] = Math.max(1, Math.min(8, num(p.count))); cpu.metaballs(num(p.count), num(p.size), num(p.speed), list(p.colors).length, f.rect, f.time, f.seed, data) })
const swirl = fillDef('swirl', 'Swirl', 6, 'Ink folding into itself: noise twisted round the centre and warped by more noise, read through a colour ramp.',
  { colors: [0x0b1026, 0x3b2c85, 0x2fb3c9, 0xf2f6ff], scale: 140, speed: 0.2, twist: 0.6, warp: 1 },
  { Ink: {}, Marble: { colors: [0xf4f1ea, 0xc9c2b4, 0x6f6a61, 0xf4f1ea], scale: 90, twist: 0.3, warp: 1.6 } },
  [cs('colors'), n('scale', 'Scale', 16, 480, 1), n('speed', 'Speed', 0, 2), n('twist', 'Twist', -2, 2), n('warp', 'Warp', 0, 2.5)],
  (i, p, f, data) => { i.p0 = [Math.max(1, num(p.scale)), num(p.speed), num(p.twist), num(p.warp)]; stops(i, p, data) })
const voronoi = fillDef('voronoi', 'Voronoi', 7, 'Cells whose seed points orbit their own spots, with exact seams to every neighbour and a little depth toward each cell centre.',
  { colors: [0x1f2a44, 0x2c3e66, 0x3d5a8a, 0x5577b0], seam: 0x0b0f1a, scale: 36, speed: 0.25, edge: 1.5, depth: 0.4 },
  { Cells: {}, 'Stained glass': { colors: [0xd7263d, 0xf46036, 0x2e294e, 0x1b998b, 0xc5d86d], seam: 0x111111, scale: 20, edge: 2, depth: 0.25 } },
  [cs('colors'), c('seam', 'Seam colour'), n('scale', 'Cell size', 6, 200, 1), n('speed', 'Speed', 0, 2), n('edge', 'Seam', 0, 8, 0.25), n('depth', 'Depth', 0, 1)],
  (i, p, f, data) => { i.c0 = col(p.seam); i.p0 = [Math.max(2, num(p.scale)), num(p.speed), num(p.edge), num(p.depth)]; stops(i, p, data) })
const waves = fillDef('waves', 'Waves', 8, 'Bands of colour stacked like a coastline or a dune field, each front shading the band behind it just above its crest.',
  { colors: [0xbfe7ff, 0x5fb3e8, 0x2a7bbf, 0x154a85, 0x0a2649], amplitude: 0.05, frequency: 1.6, speed: 0.4, angle: 0, softness: 0.006 },
  { Sea: {}, Dunes: { colors: [0xfde6c4, 0xf4b77c, 0xe08a4f, 0xb35a3a, 0x6e3226], amplitude: 0.07, frequency: 1.1, speed: 0.15 } },
  [cs('colors'), n('amplitude', 'Amplitude', 0, 0.25, 0.005), n('frequency', 'Frequency', 0.2, 6, 0.05), n('speed', 'Speed', 0, 2), n('angle', 'Angle', -RAD, RAD), n('softness', 'Softness', 0, 0.1, 0.001)],
  (i, p, f, data) => { i.p0 = [num(p.amplitude), num(p.frequency), num(p.speed), num(p.angle)]; i.p1 = [num(p.softness), 0, 0, 0]; stops(i, p, data) })
const halftone = fillDef('halftone', 'Halftone', 9, 'A print screen: dots on a rotated grid sized by tone, merging across cell lines where the ink is heavy.',
  { input: 'radial', ink: 0x1b1b1f, base: 0xf1ece1, cell: 6, angle: 0.785, rampAngle: 0.6, scale: 90, speed: 0.2, bias: 0, contrast: 1 },
  { Print: {}, Backdrop: { input: 'backdrop', cell: 4 } },
  [ch('input', 'Input', inputs), c('ink', 'Ink'), c('base', 'Base'), n('cell', 'Dot pitch', 2, 32, 0.5), n('angle', 'Screen angle', -RAD, RAD), n('rampAngle', 'Ramp angle', -RAD, RAD), n('scale', 'Noise scale', 8, 400, 1), n('speed', 'Speed', 0, 2), n('bias', 'Bias', -1, 1), n('contrast', 'Contrast', 0.2, 4)],
  (i, p) => { i.c0 = col(p.ink); i.c1 = col(p.base); i.p0 = [0, inputCode(p.input), Math.max(1, num(p.cell)), num(p.rampAngle)]; i.p1 = [Math.max(1, num(p.scale)), num(p.speed), num(p.bias), num(p.contrast)]; i.p2 = [num(p.angle), 0, 0, 0] })
const plastic = fillDef('plastic', 'Plastic', 10, 'A keycap under one soft light: the diffuse base keeps its colour, a GGX highlight widened by the size of the light, and a faint sky at grazing angles.',
  { color: 0xece8de, roughness: 0.15, dome: 0.35, bevel: 6, angle: -0.5 },
  { Glossy: {}, Matte: { color: 0x2e3036, roughness: 0.8 }, Dished: { color: 0xd8d2c4, roughness: 0.7, dome: -0.45 } },
  [c('color', 'Colour'), n('roughness', 'Roughness', 0.05, 1), n('dome', 'Dome', -1, 1), n('bevel', 'Bevel', 0, 48, 0.5), n('angle', 'Light angle', -RAD, RAD)],
  (i, p) => { i.c0 = col(p.color); i.p0 = [Math.max(0, Math.min(1, num(p.roughness, 0.15))), num(p.dome), Math.max(0, num(p.bevel)), num(p.angle)] })

// ---------------------------------------------------------------- weather and light (this site's own)
const weatherDef = (id: string, name: string, variant: number, summary: string, defaults: Params, knobs: Knob[]): EffectDef => ({
  id, name, group: 'Weather', family: 'weather', reads: 'backdrop', source: 'src/rune/fx/glsl/weather.ts', summary, presets: { Default: {} },
  defaults: { intensity: 1, wind: 0.5, speed: 1, density: 1, t0: 0, night: 1, lens: 0, ground: 0.8, tint: 0xcfe6ff, accent: 0xff4d4d, ...defaults },
  knobs: [n('intensity', 'Intensity', 0, 2), n('wind', 'Wind', 0, 2), n('speed', 'Speed', 0, 2), n('density', 'Density', 0, 2), c('tint', 'Tint'), ...knobs],
  reach: () => even(0),
  pack: (p, f) => {
    const i = blank(f), data: Table = []
    i.t[0] = f.reduced ? CALM_T : f.time; i.t[2] = variant
    i.c0 = col(p.tint); i.c1 = col(p.accent)
    i.p0 = [num(p.intensity), num(p.wind), num(p.speed), num(p.density)]
    i.p1 = [num(p.t0), num(p.night), num(p.lens), num(p.ground)]
    if (f.skyline?.length) { const first = cpu.at(data); cpu.pushSamples(data, f.skyline); i.xf = [first, f.skyline.length, 0, 0] }
    return { family: 'weather', inst: i, data }
  },
})
const rain = weatherDef('rain', 'Rain', 0, 'Three depths of slanted streaks that catch the light behind them, splashes on the wet ground, and drops sliding down the glass in surges, each a tiny fisheye showing the scene upside down.',
  { lens: 0.55, tint: 0xbfe0ff, ground: 0.8 }, [n('lens', 'Drops on glass', 0, 1), n('ground', 'Ground line', 0.3, 1)])
const snow = weatherDef('snow', 'Snow', 1, 'Four depths of flakes on the wind: fine far flakes, nearer ones that sway, and big out-of-focus bokeh flakes close to the glass; snow lifting off the ground; frost creeping in from the corners.',
  { tint: 0xe8f4ff, speed: 1, ground: 0.72 }, [n('ground', 'Ground line', 0.3, 1)])
const meteors = weatherDef('meteors', 'Shooting stars', 2, 'Stars that scintillate, and meteors in staggered slots: one crosses soon after the scene arrives, trails grow and taper, the odd fireball lights the sky. The land hides anything behind it.',
  { tint: 0x7fd7e6, accent: 0xb8fff0 }, [c('accent', 'Fireball')])
const sandstorm = weatherDef('sandstorm', 'Sandstorm', 3, 'A storm wall rolling along the horizon behind the dunes, its billows domain-warped and torn at the top, with dust gusts and grains streaming past in front.',
  { tint: 0xd9b98a, accent: 0xff4d3d, wind: 0.8 }, [c('accent', 'Horizon glow')])

const light: EffectDef = {
  id: 'light', name: 'Light', group: 'Light', family: 'light', source: 'crates/rune-light (soft shadows, rim light)',
  summary: 'A lamp above the page: raised elements cast soft shadows whose penumbra widens with distance, their bevels catch the light, and the rest of the page falls into shade.',
  defaults: { color: 0xffd9a8, intensity: 2.2, ambient: 0.72, range: 340, softness: 1, height: 120, size: 14 },
  presets: { 'Reading lamp': {}, Flashlight: { color: 0xf2f4ff, intensity: 2.6, ambient: 0.86, range: 260, height: 90, size: 10 } },
  knobs: [c('color', 'Colour'), n('intensity', 'Intensity', 0, 5), n('ambient', 'Darkness', 0, 1), n('range', 'Range', 60, 900, 1), n('softness', 'Softness', 0.2, 3), n('height', 'Height', 20, 400, 1), n('size', 'Source size', 2, 40, 0.5)],
  reach: () => even(0),
  pack: (p, f) => {
    const i = blank(f), data: Table = []
    const [lx, ly] = f.pointer ?? [f.rect.x + f.rect.w * 0.7, f.rect.y + f.rect.h * 0.25]
    i.c0 = col(p.color)
    i.p0 = [num(p.intensity), num(p.ambient), num(p.range), num(p.softness)]
    i.aux = [lx, ly, num(p.height), num(p.size)]
    const occ = f.occluders ?? []
    for (const o of occ) { cpu.push4(data, o.x, o.y, o.w, o.h); cpu.push4(data, o.radius, o.height) }
    i.xf = [0, occ.length, 0, 0]
    return { family: 'light', inst: i, data }
  },
}

export const effects: EffectDef[] = [glow, pulse, electric, fire, heatHaze, shockwave, lens, crt, split, shimmer, sparkles, aurora, grain, liquidMetal, mesh, dither, grainGradient, fluted, metaballs, swirl, voronoi, waves, halftone, plastic, rain, snow, meteors, sandstorm, light]
export const effect = (id: string) => effects.find(e => e.id === id)
/** A preset's params over the effect's defaults. */
export const paramsOf = (def: EffectDef, preset?: string, over: Params = {}): Params => ({ ...def.defaults, ...(preset ? def.presets[preset] : Object.values(def.presets)[0]), ...over })
