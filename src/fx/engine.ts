// The web runtime for the effects. A page has no frame of its own to draw effect layers into, so each
// effect gets a canvas beside its element. Small canvases share one WebGL 2
// context (drawn there, then copied), so a page of demos never runs out of contexts; a big canvas (the
// hero) can own its context and skip the copy. One clock for every layer. A canvas off screen, a hidden
// tab or a settled layer under reduced motion draws nothing. On a software renderer (no GPU) every layer
// draws one still frame, as under reduced motion, so the page stays smooth.
import { COMMON } from './glsl/common'
import { GLOW, PULSE, ELECTRIC, FIRE, EXTRAS } from './glsl/emit'
import { DISTORT, FILL } from './glsl/surface'
import { WEATHER, LIGHT } from './glsl/weather'
import type { EffectDef, Family, Frame, Params } from './effects'
import { isSoftware, rendererName } from './gpu'

const SOURCES: Record<Family, string> = { glow: GLOW, pulse: PULSE, electric: ELECTRIC, fire: FIRE, extras: EXTRAS, distort: DISTORT, fill: FILL, weather: WEATHER, light: LIGHT }
const VERT = '#version 300 es\nvoid main() { vec2 p = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }'
const UNIFORMS = ['u_size', 'u_rect', 'u_shape', 'u_c0', 'u_c1', 'u_c2', 'u_p0', 'u_p1', 'u_p2', 'u_p3', 'u_t', 'u_aux', 'u_aux2', 'u_xf', 'u_bdx', 'u_bdLod', 'u_srcLod', 'u_data', 'u_backdrop', 'u_source'] as const
const DATA_W = 1024

export type Texture = { source: TexImageSource; version: number }
export type Backdrop = Texture & { bdx?: [number, number, number, number] }
export type Layer = { def: EffectDef; params: Params; frame: Omit<Frame, 'time' | 'reduced' | 'mips'>; opacity?: number; backdrop?: Backdrop }
export type Target = {
  canvas: HTMLCanvasElement
  /** Layers for this frame, at engine time `time` (seconds). */
  layers: (time: number) => Layer[]
  /** Device pixels per point. */
  scale: number
  backdrop?: Backdrop
  source?: Texture
  /** Keep drawing while true (looping effects), or until this engine time (one-shots). */
  animate: boolean
  until?: number
  dedicated?: boolean
  visible?: boolean
  dirty?: boolean
}

type Program = { prog: WebGLProgram; loc: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null> }
class Renderer {
  gl: WebGL2RenderingContext
  programs = new Map<Family, Program | null>()
  textures = new WeakMap<TexImageSource, { tex: WebGLTexture; version: number; mips: boolean }>()
  dataTex: WebGLTexture; blank: WebGLTexture; vao: WebGLVertexArrayObject
  buf = new Float32Array(DATA_W * 4)
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
    this.vao = gl.createVertexArray()!
    this.dataTex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.dataTex)
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, DATA_W, 1, 0, gl.RGBA, gl.FLOAT, this.buf)
    this.blank = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.blank)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  }
  program(family: Family) {
    if (this.programs.has(family)) return this.programs.get(family)!
    const gl = this.gl
    const compile = (type: number, text: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, text); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(`runets: ${family} shader`, gl.getShaderInfoLog(s)); return null } return s }
    const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, COMMON + SOURCES[family])
    let program: Program | null = null
    if (vs && fs) {
      const prog = gl.createProgram()!
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
      if (gl.getProgramParameter(prog, gl.LINK_STATUS)) program = { prog, loc: Object.fromEntries(UNIFORMS.map(u => [u, gl.getUniformLocation(prog, u)])) as Program['loc'] }
      else console.error(`runets: ${family} link`, gl.getProgramInfoLog(prog))
    }
    this.programs.set(family, program)
    return program
  }
  texture(t: Texture | undefined, mips: boolean) {
    if (!t) return { tex: this.blank, mips: false }
    const gl = this.gl
    let e = this.textures.get(t.source)
    if (!e || e.version !== t.version) {
      const tex = e?.tex ?? gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t.source)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      if (mips) gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
      e = { tex, version: t.version, mips }
      this.textures.set(t.source, e)
    }
    return e
  }
  /** Draws a target's layers into the bottom-left w x h pixels of this context's drawing buffer. */
  draw(target: Target, w: number, h: number, time: number, reduced: boolean) {
    const gl = this.gl
    gl.viewport(0, 0, w, h)
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindVertexArray(this.vao)
    const src = this.texture(target.source, true)
    for (const layer of target.layers(time)) {
      const back = layer.backdrop ?? target.backdrop
      const bd = this.texture(back, true)
      const packed = layer.def.pack(layer.params, { ...layer.frame, time, reduced, mips: bd.mips })
      if (!packed) continue
      const p = this.program(packed.family)
      if (!p) continue
      gl.useProgram(p.prog)
      const rows = Math.max(1, Math.ceil(packed.data.length / 4 / DATA_W))
      if (this.buf.length < rows * DATA_W * 4) this.buf = new Float32Array(rows * DATA_W * 4)
      this.buf.fill(0, 0, rows * DATA_W * 4); this.buf.set(packed.data)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.dataTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, DATA_W, rows, 0, gl.RGBA, gl.FLOAT, this.buf.subarray(0, rows * DATA_W * 4))
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bd.tex)
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, src.tex)
      const i = packed.inst
      i.shape[1] = target.scale
      i.shape[2] *= layer.opacity ?? 1
      const L = p.loc
      gl.uniform2f(L.u_size, w, h)
      for (const k of ['rect', 'shape', 'c0', 'c1', 'c2', 'p0', 'p1', 'p2', 'p3', 't', 'aux', 'aux2', 'xf'] as const) gl.uniform4fv(L[`u_${k}`], i[k])
      gl.uniform4fv(L.u_bdx, back?.bdx ?? [1, 1, 0, 0])
      gl.uniform1f(L.u_bdLod, bd.mips ? 3.5 : 0); gl.uniform1f(L.u_srcLod, 0)
      gl.uniform1i(L.u_data, 0); gl.uniform1i(L.u_backdrop, 1); gl.uniform1i(L.u_source, 2)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
  }
}

const reducedQuery = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

class Engine {
  shared: { canvas: HTMLCanvasElement; renderer: Renderer } | null | undefined
  own = new Map<Target, Renderer | null>()
  targets = new Set<Target>()
  start = performance.now()
  raf = 0
  observer: IntersectionObserver | null = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => { for (const e of entries) { const t = [...this.targets].find(x => x.canvas === e.target); if (t) { t.visible = e.isIntersecting; t.dirty = true } } this.wake() }, { rootMargin: '120px' }) : null
  reduced = reducedQuery()
  /** True when WebGL runs on the CPU: layers then draw once and never loop. */
  slow = false
  constructor() {
    if (typeof document === 'undefined') return
    document.addEventListener('visibilitychange', () => this.wake())
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => { this.reduced = e.matches; for (const t of this.targets) t.dirty = true; this.wake() })
  }
  /** One clock: time scale, pause and manual stepping, shared by every layer (and by headless checks). */
  clock = { scale: 1, pinned: null as number | null }
  now() { return this.clock.pinned ?? ((performance.now() - this.start) / 1000) * this.clock.scale }
  /** Pin the clock at `t` seconds (null resumes); every layer redraws at that moment. */
  pin(t: number | null) { this.clock.pinned = t; for (const x of this.targets) x.dirty = true; this.wake() }
  sharedRenderer() {
    if (this.shared !== undefined) return this.shared
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: false })
    this.shared = gl ? { canvas, renderer: new Renderer(gl) } : null
    if (gl) this.check(gl)
    return this.shared
  }
  /** A software renderer sets `slow`, and `data-gpu="none"` on the root so the page's CSS can drop its blurs too. */
  check(gl: WebGL2RenderingContext) { if (!this.slow && isSoftware(rendererName(gl))) { this.slow = true; document.documentElement.dataset.gpu = 'none' } }
  /** True when this browser can draw the effects at all. */
  supported() { return !!this.sharedRenderer() }
  add(t: Target) {
    t.visible ??= true; t.dirty = true
    this.sharedRenderer() // knows `slow` before the first frame
    this.targets.add(t)
    if (t.dedicated) { const gl = t.canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false }); this.own.set(t, gl ? new Renderer(gl) : null); if (gl) this.check(gl) }
    this.observer?.observe(t.canvas)
    this.wake()
    return () => { this.targets.delete(t); this.own.delete(t); this.observer?.unobserve(t.canvas) }
  }
  wake() { if (!this.raf && typeof requestAnimationFrame === 'function') this.raf = requestAnimationFrame(() => this.frame()) }
  frame() {
    this.raf = 0
    if (document.hidden) return
    const time = this.now()
    // No GPU: draw the reduced-motion still, the frame each effect is designed to rest on.
    const still = this.reduced || this.slow
    let more = false
    for (const t of this.targets) {
      const live = t.animate && !still
      const due = t.visible && (t.dirty || (live && this.clock.pinned === null) || (t.until !== undefined && time < t.until && this.clock.pinned === null))
      if (!due) continue
      t.dirty = false
      const w = t.canvas.width, h = t.canvas.height
      if (!w || !h) continue
      const own = this.own.get(t)
      if (t.dedicated) { if (own) own.draw(t, w, h, time, still) }
      else {
        const s = this.sharedRenderer()
        if (!s) continue
        if (s.canvas.width < w || s.canvas.height < h) { s.canvas.width = Math.min(4096, Math.max(s.canvas.width, Math.ceil(w / 256) * 256)); s.canvas.height = Math.min(4096, Math.max(s.canvas.height, Math.ceil(h / 256) * 256)) }
        s.renderer.draw(t, w, h, time, still)
        const ctx = t.canvas.getContext('2d')
        if (ctx) { ctx.clearRect(0, 0, w, h); ctx.drawImage(s.canvas, 0, s.canvas.height - h, w, h, 0, 0, w, h) }
      }
      if (live || (t.until !== undefined && time < t.until)) more = true
    }
    if (more) this.wake()
  }
}

let engine: Engine | null = null
/** The page's one effects engine (created on first use, in the browser only). Exposed as `window.runetsClock` for headless checks. */
export const fxEngine = () => {
  if (!engine) { engine = new Engine(); if (typeof window !== 'undefined') (window as unknown as { runetsClock: unknown }).runetsClock = { pin: (t: number | null) => engine!.pin(t), now: () => engine!.now(), slow: () => engine!.slow } }
  return engine
}
