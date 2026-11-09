// The rune-fx prelude (common.wgsl, MIT, Anomaly) in GLSL ES 3.00 for WebGL 2.
// Invariants kept from the original: effect maths runs in points (CSS px); px = pt * scale. Colours are
// linear light; `shade` returns premultiplied light whose rgb may exceed alpha (additive). Everything is a
// pure function of (pixel, instance, time, seed): integer hashes only, so frames are deterministic.
// Web differences: one instance per draw (uniforms, not a storage buffer); CPU tables live in an RGBA32F
// texture; the backdrop is an image or canvas the page hands over, not the frame behind the layer.
export const COMMON = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform vec2 u_size;
uniform vec4 u_rect, u_shape, u_c0, u_c1, u_c2, u_p0, u_p1, u_p2, u_p3, u_t, u_aux, u_aux2, u_xf, u_bdx;
uniform float u_bdLod, u_srcLod;
uniform sampler2D u_data, u_backdrop, u_source;
out vec4 fragColor;

struct Inst { vec4 rect; vec4 shape; vec4 c0; vec4 c1; vec4 c2; vec4 p0; vec4 p1; vec4 p2; vec4 p3; vec4 t; vec4 aux; vec4 aux2; vec4 xf; };
Inst i;

const float TAU = 6.2831853;
const float PI = 3.14159265;
const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);

vec4 dat(uint k) { int ki = int(k); return texelFetch(u_data, ivec2(ki & 1023, ki >> 10), 0); }
float dat1(uint base, uint k) { return dat(base + (k >> 2u))[int(k & 3u)]; }

vec3 to_srgb(vec3 c) { return mix(1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, c * 12.92, lessThanEqual(c, vec3(0.0031308))); }
vec3 to_lin(vec3 c) { return mix(pow((max(c, vec3(0.0)) + 0.055) / 1.055, vec3(2.4)), c / 12.92, lessThanEqual(c, vec3(0.04045))); }
// The backdrop at p (pt): an sRGB image covering the target, sharp and blurred (its mip chain).
vec4 bd(vec2 p, float scale) { vec4 c = textureLod(u_backdrop, p * scale / u_size * u_bdx.xy + u_bdx.zw, 0.0); return vec4(to_lin(c.rgb), c.a); }
vec3 bdb(vec2 p, float scale) { return to_lin(textureLod(u_backdrop, p * scale / u_size * u_bdx.xy + u_bdx.zw, u_bdLod).rgb); }
vec4 src(vec2 uv, float lod) { return textureLod(u_source, uv, lod); }

// ---------- hashing / noise (integer, deterministic) ----------
uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
uint hu(uint a, uint b) { return pcg(a ^ pcg(b + 0x9E3779B9u)); }
float u01(uint n) { return float(pcg(n) >> 8u) * (1.0 / 16777216.0); }
float hcell(ivec2 c, uint seed) { return float(pcg(uint(c.x) ^ pcg(uint(c.y) ^ pcg(seed))) >> 8u) * (1.0 / 16777216.0); }
vec2 grad2(ivec2 c, uint seed) { float a = hcell(c, seed) * TAU; return vec2(cos(a), sin(a)); }
float gnoise(vec2 p, uint seed) {
  ivec2 c = ivec2(floor(p)); vec2 f = p - floor(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(grad2(c, seed), f);
  float b = dot(grad2(c + ivec2(1, 0), seed), f - vec2(1.0, 0.0));
  float cc = dot(grad2(c + ivec2(0, 1), seed), f - vec2(0.0, 1.0));
  float d = dot(grad2(c + ivec2(1, 1), seed), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(cc, d, u.x), u.y) * 1.41421;
}
float pgnoise(vec2 p, int per, uint seed) {
  ivec2 c = ivec2(floor(p)); vec2 f = p - floor(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  int x0 = ((c.x % per) + per) % per; int x1 = (x0 + 1) % per;
  float a = dot(grad2(ivec2(x0, c.y), seed), f);
  float b = dot(grad2(ivec2(x1, c.y), seed), f - vec2(1.0, 0.0));
  float cc = dot(grad2(ivec2(x0, c.y + 1), seed), f - vec2(0.0, 1.0));
  float d = dot(grad2(ivec2(x1, c.y + 1), seed), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(cc, d, u.x), u.y) * 1.41421;
}
float fbm3(vec2 p0, uint seed) { vec2 p = p0; float a = 0.5; float s = 0.0; for (uint o = 0u; o < 3u; o++) { s += a * gnoise(p, seed + o * 131u); p = ROT * p * 2.02; a *= 0.5; } return s / 0.875; }
float fbm5(vec2 p0, uint seed) { vec2 p = p0; float a = 0.5; float s = 0.0; for (uint o = 0u; o < 5u; o++) { s += a * gnoise(p, seed + o * 131u); p = ROT * p * 2.02; a *= 0.5; } return s / 0.96875; }
float ign(vec2 px) { return fract(52.9829189 * fract(dot(floor(px), vec2(0.06711056, 0.00583715)))); }

// ---------- shapes ----------
float sd_rrect(vec2 q, vec2 hf, float r) { float rr = clamp(r, 0.0, min(hf.x, hf.y)); vec2 k = abs(q) - hf + rr; return length(max(k, vec2(0.0))) + min(max(k.x, k.y), 0.0) - rr; }
float smin(float a, float b, float k) { if (k <= 0.0) return min(a, b); float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
vec2 rrect_perim(vec2 q, vec2 hf, float r0) {
  float r = clamp(r0, 0.0, min(hf.x, hf.y)); vec2 b = hf - r; vec2 a = abs(q);
  float lq = b.y + r * PI * 0.5 + b.x; float s;
  if (a.x > b.x && a.y > b.y) s = b.y + r * atan(a.y - b.y, a.x - b.x);
  else if ((a.x - b.x) > (a.y - b.y)) s = min(a.y, b.y);
  else s = b.y + r * PI * 0.5 + (b.x - min(a.x, b.x));
  float o;
  if (q.x >= 0.0 && q.y >= 0.0) o = s; else if (q.x < 0.0 && q.y >= 0.0) o = 2.0 * lq - s; else if (q.x < 0.0) o = 2.0 * lq + s; else o = 4.0 * lq - s;
  return vec2(o, 4.0 * lq);
}
struct Ctx { vec2 p; vec2 q; vec2 c; vec2 hf; float r; float scale; float aa; float d; float t; uint seed; int variant; bool reduced; };
Ctx ctx(vec2 px) {
  Ctx c;
  c.scale = i.shape.y; c.p = px / c.scale; c.hf = i.rect.zw * 0.5; c.c = i.rect.xy + c.hf;
  c.q = (px - c.c * c.scale) / c.scale; c.r = i.shape.x; c.aa = 1.0 / c.scale; c.d = sd_rrect(c.q, c.hf, c.r);
  c.t = i.t.x; c.seed = uint(i.t.y); c.variant = int(i.t.z + 0.5); c.reduced = (uint(i.t.w) & 1u) != 0u;
  return c;
}
vec2 sd_grad(Ctx c) {
  float e = 0.35;
  float dx = sd_rrect(c.q + vec2(e, 0.0), c.hf, c.r) - sd_rrect(c.q - vec2(e, 0.0), c.hf, c.r);
  float dy = sd_rrect(c.q + vec2(0.0, e), c.hf, c.r) - sd_rrect(c.q - vec2(0.0, e), c.hf, c.r);
  vec2 g = vec2(dx, dy); return g / max(length(g), 1e-5);
}

// ---------- light profiles ----------
float erf_approx(float x) { float x2 = x * x; float a = 0.147; float v = sqrt(1.0 - exp(-x2 * (1.2732395 + a * x2) / (1.0 + a * x2))); return x >= 0.0 ? v : -v; }
float cov(float d, float s) { return 0.5 - 0.5 * erf_approx(d / (max(s, 1e-3) * 1.41421)); }
float gauss(float x, float w) { return exp(-(x * x) / max(w * w, 1e-6)); }
float bloom(float d, float r, float reach) { float o = max(d, 0.0); float w = 1.0 - smoothstep(reach * 0.5, reach, o); return (0.65 * gauss(o, r * 0.35) + 0.35 * gauss(o, r * 1.2)) * w; }
float knee(float x) { return 1.0 - exp(-max(x, 0.0)); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 cooled(vec3 c, float heat) { vec3 deep = c * c / max(max(c.r, max(c.g, c.b)), 0.02); return mix(deep * 0.55, c, smoothstep(0.0, 0.75, heat)); }
vec2 segdist(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); return vec2(length(p - a - ab * h), h); }
vec4 finish(vec4 c0, vec2 px) { vec4 c = max(c0, vec4(0.0)); c.a = min(c.a, 1.0); return c; }

vec4 shade(vec2 px);

void main() {
  i = Inst(u_rect, u_shape, u_c0, u_c1, u_c2, u_p0, u_p1, u_p2, u_p3, u_t, u_aux, u_aux2, u_xf);
  vec2 px = vec2(gl_FragCoord.x, u_size.y - gl_FragCoord.y);
  vec4 c = max(shade(px) * i.shape.z, vec4(0.0));
  // A canvas composites premultiplied sRGB and cannot add light, so light beyond coverage becomes
  // coverage of its own hue (over dark UI this matches an additive blend).
  float m = max(c.a, max(c.r, max(c.g, c.b)));
  if (m <= 1e-5) { fragColor = vec4(0.0); return; }
  float a = min(m, 1.0);
  vec3 s = to_srgb(clamp(c.rgb / m, 0.0, 1.0));
  uvec2 ip = uvec2(px);
  float n = (u01(ip.x + pcg(ip.y)) + u01(ip.x * 7919u + pcg(ip.y + 104729u)) - 1.0) / 255.0;
  fragColor = vec4(clamp(s + n, 0.0, 1.0) * a, a);
}
`
