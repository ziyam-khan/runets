// Per-frame CPU tables, ported from rune-fx `cpu.rs` (MIT, Anomaly): anything that is a 1D function of
// (time, seed) or a particle list is evaluated once per frame here instead of once per pixel. The
// integer hashes match the shaders bit for bit, so CPU and GPU noise agree.

export type Rect = { x: number; y: number; w: number; h: number }
/** A flat list of vec4s, four floats each: uploaded to the shader's data texture. */
export type Table = number[]

const TAU = Math.PI * 2

export function pcg(v: number) {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0
  return ((w >>> 22) ^ w) >>> 0
}
export const hu = (a: number, b: number) => pcg((a ^ pcg((b + 0x9e3779b9) >>> 0)) >>> 0)
export const u01 = (n: number) => (pcg(n >>> 0) >>> 8) / 16777216
const hcell = (cx: number, cy: number, seed: number) => (pcg(((cx >>> 0) ^ pcg(((cy >>> 0) ^ pcg(seed >>> 0)) >>> 0)) >>> 0) >>> 8) / 16777216
const fade = (f: number) => f * f * f * (f * (f * 6 - 15) + 10)
const rem = (a: number, b: number) => ((a % b) + b) % b

/** Gradient noise, about [-1, 1]; `per` > 0 makes it periodic in x. */
export function gnoise(x: number, y: number, per: number, seed: number) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  let x0 = ix, x1 = ix + 1
  if (per > 0) { x0 = rem(ix, per); x1 = (x0 + 1) % per }
  const dot = (cx: number, cy: number, dx: number, dy: number) => { const a = hcell(cx, cy, seed) * TAU; return Math.cos(a) * dx + Math.sin(a) * dy }
  const a = dot(x0, iy, fx, fy), b = dot(x1, iy, fx - 1, fy), c = dot(x0, iy + 1, fx, fy - 1), d = dot(x1, iy + 1, fx - 1, fy - 1)
  const ux = fade(fx), uy = fade(fy)
  const ab = a + (b - a) * ux, cd = c + (d - c) * ux
  return (ab + (cd - ab) * uy) * 1.41421
}
/** Multi-octave lateral displacement for bolts, about [-1.6, 1.6]. */
function disp(x0: number, t0: number, per0: number, seed: number, oct: number) {
  let x = x0, t = t0, a = 1, s = 0, n = 0, per = per0
  for (let o = 0; o < oct; o++) {
    s += a * gnoise(x, t, per, (seed + o * 101) >>> 0); n += a
    if (per > 0) { x *= 2; per *= 2 } else x *= 2.07
    t *= 1.55; a *= 0.5
  }
  return (s / n) * 1.6
}

export const push4 = (data: Table, a: number, b = 0, c = 0, d = 0) => { data.push(a, b, c, d) }
/** Index (in vec4s) the next push lands at. */
export const at = (data: Table) => data.length / 4
export function pushSamples(data: Table, v: ArrayLike<number>) {
  for (let i = 0; i < v.length; i += 4) data.push(v[i] ?? 0, v[i + 1] ?? 0, v[i + 2] ?? 0, v[i + 3] ?? 0)
}

/** Approximate Gaussian blur (three box passes) of a sampled path, radius in samples. */
function blur3(v: number[], radius: number, wrap: boolean) {
  const n = v.length
  const r = Math.max(0, Math.min(Math.round(radius * 0.58), Math.floor(n / 2) - 1))
  if (r === 0) return v.slice()
  let a = v.slice(), b = new Array<number>(n).fill(0)
  const get = (arr: number[], i: number) => wrap ? arr[rem(i, n)] : arr[Math.max(0, Math.min(n - 1, i))]
  for (let pass = 0; pass < 3; pass++) {
    let acc = 0
    for (let k = -r; k <= r; k++) acc += get(a, k)
    const inv = 1 / (2 * r + 1)
    for (let i = 0; i < n; i++) { b[i] = acc * inv; acc += get(a, i + r + 1) - get(a, i - r) }
    ;[a, b] = [b, a]
  }
  return a
}
export function rrectTotal(rect: Rect, radius: number) {
  const r = Math.max(0, Math.min(radius, Math.min(rect.w, rect.h) * 0.5))
  return 4 * (rect.h * 0.5 - r + r * Math.PI * 0.5 + rect.w * 0.5 - r)
}
const FORK_SAMPLES = 16
export const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const gauss3 = (h: number) => (u01(h) + u01(h + 1) + u01(h + 2) - 1.5) * 2

/** Strike timing: strike k starts at (k + jitter) * period; speed 0 is one strike that never re-strikes. */
class Strikes {
  period: number; seed: number
  constructor(speed: number, seed: number) { this.period = speed > 0 ? Math.max(0.05, Math.min(4, 0.55 / speed)) : Infinity; this.seed = hu(seed, 0x5157) }
  start(k: number) {
    if (!Number.isFinite(this.period)) return k <= 0 ? 0 : Infinity
    return (k + 0.35 * u01(hu(this.seed, k >>> 0))) * this.period
  }
  at(t: number): [number, number, number] {
    if (!Number.isFinite(this.period)) return [0, Math.max(t, 0), Infinity]
    let k = Math.floor(t / this.period)
    if (t < this.start(k)) k -= 1
    const s = this.start(k)
    return [k, t - s, this.start(k + 1) - s]
  }
  channel(k: number) { const c = Math.floor(k / 3 + 0.5 * u01(hu(this.seed, 77))); return hu((this.seed ^ 0xc4a2) >>> 0, c >>> 0) }
  strikeSeed(k: number) { return hu((this.seed ^ 0x3d1f) >>> 0, k >>> 0) }
}
function strikeEnv(age: number, dur: number, flicker: number, h: number) {
  const flash = 1 + 0.65 * Math.exp(-age / 0.022)
  const a1 = Number.isFinite(dur) ? dur * (0.3 + 0.4 * u01(h)) : Infinity
  const ret = u01(h + 1) < 0.6 && age > a1 ? 0.7 * flicker * Math.exp(-(age - a1) / 0.03) : 0
  const settle = 0.72 + 0.28 * Math.exp(-age / 0.12)
  return flash * settle + ret
}
export const ZAP_LIFE = 0.5
function zapEnv(age: number, flicker: number, reduced: boolean, h: number) {
  const out = 1 - ss(0.6, 1, age / ZAP_LIFE)
  if (reduced) return Math.exp(-age / 0.15) * out
  const a1 = 0.07 + 0.06 * u01(h)
  const ret = age > a1 ? (0.5 + 0.5 * flicker) * Math.exp(-(age - a1) / 0.035) : 0
  return ((1 + 0.65 * Math.exp(-age / 0.022)) * Math.exp(-age / 0.11) + ret) * out
}
const ghostEnv = (g: number) => 0.9 * Math.exp(-g / 0.07)

/** Midpoint displacement: every level halves each segment and pushes the midpoint sideways. */
function mpd(pts0: number[], periodic: boolean, levels: number, amp: (lv: number) => number, channel: number, strike: number, memory: number) {
  let pts = pts0
  for (let lv = 0; lv < levels; lv++) {
    const m = pts.length, seg = periodic ? m : m - 1
    const sd = hu(lv < memory ? channel : strike, lv * 7919 + 1)
    const a = amp(lv)
    const next: number[] = []
    for (let i = 0; i < seg; i++) { const p0 = pts[i], p1 = pts[(i + 1) % m]; next.push(p0, (p0 + p1) * 0.5 + a * gauss3(hu(sd, i * 3))) }
    if (!periodic) next.push(pts[m - 1])
    pts = next
  }
  return pts
}
function resample(ctrl: number[], n: number, periodic: boolean, limit: number) {
  const out = new Array<number>(n).fill(0)
  if (limit <= 0) return out
  const m = ctrl.length
  for (let i = 0; i < n; i++) {
    const x = periodic ? (i / n) * m : (i / (n - 1)) * (m - 1)
    const i0 = Math.min(Math.floor(x), m - 1)
    const f = x - i0
    const i1 = periodic ? (i0 + 1) % m : Math.min(i0 + 1, m - 1)
    const d = ctrl[i0] + (ctrl[i1] - ctrl[i0]) * f
    out[i] = limit * Math.tanh(d / limit)
  }
  return out
}
function forkWalk(hk: number, len: number) {
  const s = new Array<number>(FORK_SAMPLES).fill(0)
  let acc = 0
  for (let i = 1; i < FORK_SAMPLES; i++) { acc = Math.max(-len * 0.3, Math.min(len * 0.3, acc + gauss3(hu(hk, 100 + i)) * len * 0.07)); s[i] = acc }
  return s
}
function forkEnv(age: number, life: number): [number, number, number] {
  const grow = 1 - (1 - Math.min(age / 0.035, 1)) ** 3
  const lifee = ss(0, 0.01, age) * Math.exp(-age / (life * 0.4)) * (1 - ss(0.75 * life, life, age))
  return [grow, lifee, 1 - age / life]
}

export type ElectricP = { style: 'arc' | 'border' | 'charged'; a: [number, number]; b: [number, number]; amplitude: number; frequency: number; speed: number; glow: number; forks: number; flicker: number; strands: number; forkLen: number; zap: number | null }
const arcAmp = (p: ElectricP, l: number) => p.amplitude * Math.sqrt(l / 100)
const arcForkLen = (l: number) => Math.max(12, Math.min(80, l * 0.16))
/** How far an arc's bolt and forks can reach off the A-B line, so bounds never clip them. */
export const arcReach = (p: ElectricP, l: number) => 2 * arcAmp(p, l) + (p.forks > 0 ? arcForkLen(l) * 1.1 : 0)
const nextMul4 = (n: number) => Math.ceil(n / 4) * 4

function crawl(n: number, cells: number, speed: number, t: number, seed: number, k: number, calm: boolean) {
  const buf = new Array<number>(n)
  const cc = Math.max(Math.trunc(cells / 3), 2)
  const sp = calm ? speed * 0.35 : speed
  for (let i = 0; i < n; i++) {
    const cx = (i / n) * cc
    const c = 0.5 + 0.5 * gnoise(cx - t * sp * 0.08 * cc, t * 0.35 + k * 5, cc, (seed + 3) >>> 0)
    buf[i] = calm ? 0.45 + 0.55 * ss(0.2, 0.8, c) : 0.3 + 0.7 * ss(0.25, 0.75, c)
  }
  return buf
}
function forkSlot(seed: number, j: number, t: number, rate: number, baseP: number, varP: number) {
  const hj = hu(seed, j * 977 + 13)
  const p = baseP + varP * u01(hj)
  const tau = t / p + u01(hj + 1)
  const kk = Math.floor(tau)
  const age = (tau - kk) * p
  const hk = hu(hj, kk >>> 0)
  if (u01(hk) > rate) return null
  const life = 0.15 + 0.1 * u01(hk + 2)
  if (age > life) return null
  return { hk, age, life }
}

/**
 * Electric tables. Layout: [N, strands, forks, 0], [strand brightness], strands x N/4 displacement
 * vec4s, strands x N/4 blurred displacement (halo path), (border: strands x N/4 crawl), forks x 6 vec4s.
 * Returns xf = (first, N, forks, strands).
 */
export function electric(p: ElectricP, rect: Rect, radius: number, t: number, seed: number, reduced: boolean, data: Table): [number, number, number, number] {
  const first = at(data)
  const freq = p.frequency / 100
  const strands = p.zap !== null ? 1 : Math.max(1, Math.min(3, Math.round(p.strands)))
  const rate = reduced ? 0 : p.forks
  const st = new Strikes(reduced || p.zap !== null ? 0 : p.speed, seed)
  const [k, age, dur] = reduced && p.zap === null ? [0, 1, Infinity] : st.at(t - (p.zap ?? 0))
  const start = (ks: number) => p.zap !== null ? (ks === 0 ? p.zap : Infinity) : st.start(ks)
  const still = reduced || !Number.isFinite(st.period)
  const noise = (j: number) => reduced ? 1 : 1 - p.flicker * 0.25 * (0.5 + 0.5 * gnoise(t * 14, j * 3.7, 0, (seed + 17) >>> 0))
  const bright = p.zap !== null
    ? [zapEnv(age, p.flicker, reduced, st.strikeSeed(0)) * noise(0), 0, 0]
    : [reduced ? 1 : strikeEnv(age, dur, p.flicker, st.strikeSeed(k)) * noise(0), still ? 0 : ghostEnv(age) * noise(1), still ? 0 : ghostEnv(age + st.start(k) - st.start(k - 1)) * noise(2)]
  const hdr = data.length
  push4(data, 0); push4(data, bright[0], bright[1], bright[2], 0)
  const setHdr = (n: number, s: number, f: number) => { data[hdr] = n; data[hdr + 1] = s; data[hdr + 2] = f }
  if (p.style === 'arc') {
    const [a, b] = [p.a, p.b]
    const l = Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]))
    const n = nextMul4(Math.max(32, Math.min(1024, Math.ceil(l))))
    const step = l / (n - 1)
    const amp = arcAmp(p, l)
    const levels = Math.max(3, Math.min(8, Math.ceil(Math.log2(Math.max(8, l * freq * 6)))))
    const path = (ks: number) => resample(mpd([0, 0], false, levels, lv => amp * 0.65 * 2 ** (-0.62 * lv), st.channel(ks), st.strikeSeed(ks), 2), n, false, amp * 2)
    const paths = Array.from({ length: Math.max(strands, 2) }, (_, j) => path(k - j))
    for (let j = 0; j < strands; j++) pushSamples(data, paths[j])
    for (let j = 0; j < strands; j++) pushSamples(data, blur3(paths[j], (p.glow * 1.2) / step, false))
    const dir = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], nrm = [-dir[1], dir[0]]
    let forks = 0
    strikes: for (let j = 0; j < 2; j++) {
      const ks = k - j, fage = t - start(ks)
      for (let c = 0; c < 3; c++) {
        if (forks === 4) break strikes
        const hk = hu((st.strikeSeed(ks) ^ 0xf04c) >>> 0, c)
        const life = 0.07 + 0.13 * u01(hk + 2)
        if (u01(hk) > rate || fage > life || fage < 0) continue
        const pth = paths[j]
        const u0 = 0.12 + 0.73 * u01(hk + 3)
        const i0 = Math.max(2, Math.min(n - 3, Math.floor(u0 * (n - 1))))
        const slope = (pth[i0 + 2] - pth[i0 - 2]) / (4 * step)
        const side = u01(hk + 4) > 0.5 ? 1 : -1
        const ang = Math.atan(slope) + (0.35 + 0.5 * u01(hk + 5)) * side
        const len = arcForkLen(l) * (0.45 + 0.55 * u01(hk + 6))
        const o = [a[0] + dir[0] * u0 * l + nrm[0] * pth[i0], a[1] + dir[1] * u0 * l + nrm[1] * pth[i0]]
        const sa = Math.sin(ang), ca = Math.cos(ang)
        const fd = [dir[0] * ca - dir[1] * sa, dir[0] * sa + dir[1] * ca]
        const [grow, lifee, heat] = forkEnv(fage, life)
        push4(data, o[0], o[1], fd[0], fd[1]); push4(data, len, grow, lifee * Math.max(bright[0], 0.6), heat)
        pushSamples(data, forkWalk(hk, len))
        forks++
      }
    }
    setHdr(n, strands, forks)
    return [first, n, forks, strands]
  }
  const total = rrectTotal(rect, radius)
  const n = nextMul4(Math.max(64, Math.min(2048, Math.ceil(total))))
  const step = total / n
  if (p.style === 'border') {
    const cells = Math.max(3, Math.round(total * freq))
    const path = (ks: number) => {
      const ch = st.channel(ks)
      const coarse = Array.from({ length: cells }, (_, i) => p.amplitude * 0.7 * gauss3(hu(ch, i * 3 + 5)))
      return resample(mpd(coarse, true, 3, lv => p.amplitude * 0.7 * 2 ** (-0.62 * (lv + 1)), ch, st.strikeSeed(ks), 1), n, true, p.amplitude * 1.7)
    }
    const paths = Array.from({ length: Math.max(strands, 2) }, (_, j) => path(k - j))
    for (let j = 0; j < strands; j++) pushSamples(data, paths[j])
    for (let j = 0; j < strands; j++) pushSamples(data, blur3(paths[j], (p.glow * 1.2) / step, true))
    for (let j = 0; j < strands; j++) pushSamples(data, crawl(n, cells, p.speed, t, (seed + j * 7919) >>> 0, j, false))
    let forks = 0
    strikes: for (let j = 0; j < 2; j++) {
      const ks = k - j, fage = t - start(ks)
      for (let c = 0; c < 3; c++) {
        if (forks === 5) break strikes
        const hk = hu((st.strikeSeed(ks) ^ 0xf04c) >>> 0, c)
        const life = 0.07 + 0.13 * u01(hk + 2)
        if (u01(hk) > rate || fage > life || fage < 0) continue
        const i0 = Math.min(Math.floor(u01(hk + 3) * n), n - 1)
        const len = p.forkLen * (0.6 + 0.6 * u01(hk + 4))
        const [grow, lifee, heat] = forkEnv(fage, life)
        push4(data, i0 * step, total, paths[j][i0], 0); push4(data, len, grow, lifee * Math.max(bright[0], 0.6), heat)
        pushSamples(data, forkWalk(hk, len))
        forks++
      }
    }
    setHdr(n, strands, forks)
    return [first, n, forks, strands]
  }
  // Charged: the calm UI border keeps a continuously crawling hairline, no strikes.
  data[hdr + 4] = 1; data[hdr + 5] = 0; data[hdr + 6] = 0
  const cells = Math.max(3, Math.round(total * freq))
  const tm = reduced ? 0 : t
  const buf = Array.from({ length: n }, (_, i) => disp((i / n) * cells, tm * p.speed * 0.35, cells, seed, 3) * p.amplitude)
  pushSamples(data, buf)
  pushSamples(data, blur3(buf, (p.glow * 1.2) / step, true))
  pushSamples(data, crawl(n, cells, p.speed, tm, seed, 0, true))
  let forks = 0
  for (let j = 0; j < 5; j++) {
    const f = forkSlot(seed, j, t, rate * 0.5, 0.3, 0.25)
    if (!f) continue
    const len = p.forkLen * 0.4 * (0.6 + 0.6 * u01(f.hk + 4))
    const [grow, lifee, heat] = forkEnv(f.age, f.life)
    push4(data, u01(f.hk + 3) * total, total, 0, 0); push4(data, len, grow, lifee, heat)
    pushSamples(data, forkWalk(f.hk, len))
    forks++
  }
  setHdr(n, 1, forks)
  return [first, n, forks, 1]
}

export const EMBER_DRAG = 2.4
export type EmberP = { height: number; emberRise: number; emberSize: number; emberLife: number; embers: number }
/** Embers: (pos, streak), (size, temperature, 0, 0) per live ember. Returns (first, count). */
export function embers(p: EmberP, rect: Rect, radius: number, t: number, seed: number, data: Table): [number, number] {
  const first = at(data)
  let count = 0
  const life0 = Math.max(p.emberLife, 0.1), k = EMBER_DRAG
  for (let e = 0; e < Math.min(p.embers, 40); e++) {
    const hk0 = hu((seed + 991) >>> 0, e * 7 + 3)
    const life = life0 * (0.6 + 0.8 * u01(hk0))
    const tau = t / life + u01(hk0 + 1)
    const kk = Math.floor(tau), a = tau - kk
    const hk = hu(hk0, kk >>> 0)
    const age = a * life
    const x0 = rect.x + radius * 0.6 + (rect.w - radius * 1.2) * u01(hk + 2)
    const y0 = rect.y - p.height * (0.1 + 0.45 * u01(hk + 3))
    const v0 = -p.emberRise * (1 + 0.8 * u01(hk + 4)), vt = -p.emberRise * 0.32
    const ek = Math.exp(-k * age)
    const y = y0 + vt * age + ((v0 - vt) * (1 - ek)) / k
    const vy = vt + (v0 - vt) * ek
    const sway = 2.5 + 5 * u01(hk + 5), fq = 3 + 4 * u01(hk + 6), ph = TAU * u01(hk + 7)
    const drift = (u01(hk + 8) - 0.5) * 14
    const grow = 1 - Math.exp(-age * 3)
    const x = x0 + drift * age + sway * Math.sin(age * fq + ph) * grow
    const vx = drift + sway * (Math.cos(age * fq + ph) * fq * grow + Math.sin(age * fq + ph) * 3 * Math.exp(-age * 3))
    const sz = p.emberSize * (0.5 + 0.8 * u01(hk + 9)) * (1 - 0.4 * a)
    const attack = Math.max(0, Math.min(1, age / 0.05))
    const temp = Math.exp(-age / (life * 0.42)) * (1 - a * a) * (0.8 + 0.3 * u01(hk + 10)) * attack
    if (temp < 0.004) continue
    const shutter = 0.6 / 60
    push4(data, x, y, vx * shutter, vy * shutter); push4(data, sz, temp)
    count++
  }
  return [first, count]
}

export const SPARKLE_STAGGER = 0.16
export const BURST_LIFE = 0.55
export const SPARKLE_MAX_SCALE = 1.16 * 1.35
function starScale(a: number) {
  const x = Math.min(a / 0.22, 1), c = 2.2
  return (1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2) * (1 - ss(0.55, 1, a))
}
export type SparkleP = { count: number; life: number; size: number; margin: number; burst: number | null }
/** Sparkles: (pos, size, brightness), (cos, sin, 0, 0) each. */
export function sparkles(p: SparkleP, rect: Rect, t: number, seed: number, reduced: boolean, data: Table): [number, number] {
  const first = at(data)
  let count = 0
  const cx = rect.x + rect.w * 0.5, cy = rect.y + rect.h * 0.5, hw = rect.w * 0.5, hh = rect.h * 0.5
  for (let k = 0; k < Math.min(p.count, 64); k++) {
    const h0 = hu((seed + 313) >>> 0, k * 11 + 1)
    let hk: number, age: number, life: number
    if (p.burst !== null) { life = p.life * BURST_LIFE * (0.7 + 0.6 * u01(h0)); hk = h0; age = t - p.burst - SPARKLE_STAGGER * u01(h0 + 1) }
    else if (reduced) { if (u01(h0 + 9) > 0.6) continue; hk = h0; age = 0.5; life = 1 }
    else {
      life = p.life * (0.7 + 0.6 * u01(h0))
      const cycle = life * (1.5 + 0.8 * u01(h0 + 2))
      const tau = t / cycle + u01(h0 + 1), kk = Math.floor(tau)
      hk = hu(h0, kk >>> 0); age = (tau - kk) * cycle
    }
    if (age < 0 || age > life) continue
    const a = age / life
    const th = TAU * u01(hk + 2), dx = Math.cos(th), dy = Math.sin(th)
    const edge = 1 / Math.max(Math.abs(dx) / Math.max(hw, 1), Math.abs(dy) / Math.max(hh, 1))
    let out = p.margin * (0.15 + 0.85 * u01(hk + 3))
    if (p.burst !== null && !reduced) out *= 0.35 + 0.65 * (1 - Math.exp(-age * 5))
    const v = u01(hk + 4)
    const size = p.size * (0.45 + 0.9 * v * v)
    let sc: number, env: number
    if (reduced) { sc = 1; env = Math.sin(Math.PI * a) * 0.7 }
    else { const fq = 5 + 4 * u01(hk + 5), tw = 0.5 + 0.5 * Math.sin(TAU * fq * age + TAU * u01(hk + 6)); sc = starScale(a); env = 1 - 0.3 * tw * tw }
    if (sc * env < 0.01) continue
    const spin = reduced ? 0 : (u01(hk + 7) - 0.5) * 1.2 * age
    const ang = (u01(hk + 8) - 0.5) * 0.35 + spin
    push4(data, cx + dx * (edge + out), cy + dy * (edge + out), size * sc, env); push4(data, Math.cos(ang), Math.sin(ang))
    count++
  }
  return [first, count]
}

export const AURORA_SAMPLES = 64
/** Aurora curtains: for each of three, AURORA_SAMPLES heights then AURORA_SAMPLES warps across the width. */
export function aurora(scale: number, speed: number, rect: Rect, t: number, seed: number, data: Table) {
  const first = at(data)
  const tt = t * speed
  for (let k = 0; k < 3; k++) {
    const ys = new Array<number>(AURORA_SAMPLES), ws = new Array<number>(AURORA_SAMPLES)
    for (let i = 0; i < AURORA_SAMPLES; i++) {
      const x = rect.x + (rect.w * i) / (AURORA_SAMPLES - 1)
      const qx = x / Math.max(scale, 1)
      let s = 0, a = 0.5, px = qx * 0.55 + tt * (0.25 + 0.12 * k), py = k * 3.1 + tt * 0.07
      for (let o = 0; o < 3; o++) {
        s += a * gnoise(px, py, 0, (seed + k + o * 131) >>> 0)
        const nx = 0.8 * px - 0.6 * py, ny = 0.6 * px + 0.8 * py
        px = nx * 2.02; py = ny * 2.02; a *= 0.5
      }
      const wv = s / 0.875
      ws[i] = wv; ys[i] = 0.3 + 0.2 * k + 0.22 * wv
    }
    pushSamples(data, ys); pushSamples(data, ws)
  }
  return first
}

/** Fold time into 0..512 s with a triangle wave, so noise coordinates keep their precision. */
export function foldT(t: number) {
  if (!Number.isFinite(t)) return 0
  const u = rem(t / 1024, 1)
  return u <= 0.5 ? u * 1024 : (1 - u) * 1024
}
export function meshPoints(points: [number, number][], drift: number, speed: number, t: number, seed: number) {
  const tt = foldT(t * speed * 0.5)
  return points.map(([x0, y0], k) => {
    const s = (seed + k * 31) >>> 0, x = tt + k * 13.1
    return [x0 + drift * 1.4 * gnoise(x, 0.5, 0, s), y0 + drift * 1.4 * gnoise(x, 7.5, 0, (s + 97) >>> 0)] as [number, number]
  })
}
/** Metaball centres, radii and colour index: one vec4 per ball. */
export function metaballs(count: number, size: number, speed: number, colors: number, rect: Rect, t: number, seed: number, data: Table) {
  const n = Math.max(1, Math.min(8, count))
  const short = Math.max(0, Math.min(rect.w, rect.h))
  const tt = foldT(t * speed * 0.5)
  for (let k = 0; k < n; k++) {
    const h = hu(seed, k + 1)
    const a = ((k + u01(h) * 0.6) / n) * TAU
    const x = tt + k * 7.3
    const wx = gnoise(x, 1.5, 0, h) * 0.5, wy = gnoise(x, 4.5, 0, (h + 5) >>> 0) * 0.5
    const r = size * short * (0.7 + 0.6 * u01(h + 2))
    push4(data, rect.x + rect.w * (0.5 + 0.24 * Math.cos(a) + wx), rect.y + rect.h * (0.5 + 0.24 * Math.sin(a) + wy), r, k % Math.max(colors, 1))
  }
}

export const BLUE_N = 32
let blueTile: number[] | null = null
/** A 32 x 32 blue-noise threshold tile by void-and-cluster, built once. */
export function blueNoise() {
  if (blueTile) return blueTile
  const N = BLUE_N, M = N * N, sigma = 1.5
  const kern = new Float32Array(M)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const dx = Math.min(x, N - x), dy = Math.min(y, N - y); kern[y * N + x] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)) }
  let on = new Array<boolean>(M).fill(false)
  let energy = new Float32Array(M)
  const splat = (e: Float32Array, i: number, sign: number) => { const ix = i % N, iy = Math.floor(i / N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) e[y * N + x] += sign * kern[((y + N - iy) % N) * N + ((x + N - ix) % N)] }
  const tightest = (o: boolean[], e: Float32Array) => { let best = -1; for (let i = 0; i < M; i++) if (o[i] && (best < 0 || e[i] > e[best])) best = i; return best }
  const voidest = (o: boolean[], e: Float32Array) => { let best = -1; for (let i = 0; i < M; i++) if (!o[i] && (best < 0 || e[i] < e[best])) best = i; return best }
  let ones = 0
  for (let i = 0; i < M; i++) if (u01(hu(i, 0xb10e)) < 0.1) { on[i] = true; ones++ }
  for (let i = 0; i < M; i++) if (on[i]) splat(energy, i, 1)
  for (let it = 0; it < M; it++) {
    const c = tightest(on, energy); on[c] = false; splat(energy, c, -1)
    const v = voidest(on, energy); on[v] = true; splat(energy, v, 1)
    if (v === c) break
  }
  const rank = new Array<number>(M).fill(0)
  const protoOn = on.slice(), protoE = energy.slice()
  for (let r = ones - 1; r >= 0; r--) { const c = tightest(on, energy); on[c] = false; splat(energy, c, -1); rank[c] = r }
  on = protoOn; energy = protoE
  for (let r = ones; r < M; r++) { const v = voidest(on, energy); on[v] = true; splat(energy, v, 1); rank[v] = r }
  blueTile = rank.map(r => (r + 0.5) / M)
  return blueTile
}

/** sRGB hex (0xRRGGBB) to linear rgb. */
export function linear(hex: number): [number, number, number] {
  const f = (s: number) => { const c = ((hex >> s) & 0xff) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return [f(16), f(8), f(0)]
}
export function oklab([r, g, b]: [number, number, number]): [number, number, number] {
  const l = Math.cbrt(Math.max(0, 0.41222146 * r + 0.53633255 * g + 0.051445995 * b))
  const m = Math.cbrt(Math.max(0, 0.2119035 * r + 0.6806995 * g + 0.10739696 * b))
  const s = Math.cbrt(Math.max(0, 0.08830246 * r + 0.28171885 * g + 0.6299787 * b))
  return [0.21045426 * l + 0.7936178 * m - 0.004072047 * s, 1.9779985 * l - 2.4285922 * m + 0.4505937 * s, 0.025904037 * l + 0.78277177 * m - 0.80867577 * s]
}
/** A colour list as the fill shaders read it: per stop, (linear rgb, point x) then (OKLab, point y). */
export function pushStops(data: Table, hexes: number[], points?: [number, number][]): [number, number] {
  const first = at(data)
  hexes.slice(0, 6).forEach((hex, k) => { const c = linear(hex), l = oklab(c), p = points?.[k] ?? [0, 0]; push4(data, c[0], c[1], c[2], p[0]); push4(data, l[0], l[1], l[2], p[1]) })
  return [first, Math.min(hexes.length, 6)]
}
