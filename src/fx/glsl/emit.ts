// Light-emitting effects ported from rune-fx (MIT, Anomaly): glow.wgsl, pulse.wgsl, electric.wgsl,
// fire.wgsl (noise flames, plasma and embers; the GPU fluid simulation is not ported) and extras.wgsl.
// Slot layouts are the originals'; see effects.ts for the packing.

export const GLOW = /* glsl */ `
// variant: 0 soft, 1 neon, 2 aura, 3 mask. c0 tint, c1 hot core, c2 aura third
// p0 (radius, intensity, inner, occlusion) p1 (breathe_amp, breathe_period, heat, hot) p2 (aura_speed, rim_width, reach_mul, _)
vec3 aura_palette(float u, vec3 a, vec3 b, vec3 c) {
  float x = fract(u) * 3.0;
  float w0 = smoothstep(1.0, 0.0, min(x, 3.0 - x)); float w1 = smoothstep(1.0, 0.0, abs(x - 1.0)); float w2 = smoothstep(1.0, 0.0, abs(x - 2.0));
  return (a * w0 + b * w1 + c * w2) / max(w0 + w1 + w2, 1e-4);
}
float mask_tent(vec2 uv, float lod) {
  vec2 texel = exp2(lod) / vec2(textureSize(u_source, 0)); vec2 o = texel * 0.5;
  return (src(uv + vec2(o.x, o.y), lod).a + src(uv + vec2(-o.x, o.y), lod).a + src(uv + vec2(o.x, -o.y), lod).a + src(uv + vec2(-o.x, -o.y), lod).a) * 0.25;
}
vec4 shade(vec2 px) {
  Ctx c = ctx(px);
  float radius = i.p0.x; float intensity = i.p0.y; float inner = i.p0.z; float occl = i.p0.w; float heat = i.p1.z; float hot = i.p1.w;
  float b = 0.0;
  if (!c.reduced && i.p1.y > 0.0) { b = 0.5 - 0.5 * cos(TAU * c.t / i.p1.y); b = b * b * (3.0 - 2.0 * b); }
  float amp = i.p1.x;
  intensity *= (1.0 - amp) + amp * b;
  radius *= 1.0 + 0.22 * amp * b;
  radius *= mix(0.72, 1.0, heat);
  intensity *= pow(max(heat, 1e-4), 1.6);
  vec3 tint = cooled(i.c0.rgb, heat);
  float reach = radius * i.p2.z;
  vec3 light = vec3(0.0); float alpha = 0.0;
  float edge = smoothstep(-c.aa, c.aa, c.d);
  if (c.variant == 3) {
    vec2 uv = (c.p - i.aux2.xy) / i.aux2.zw;
    float base = log2(max(radius * c.scale, 1.0)) - 0.6;
    float m = 0.45 * mask_tent(uv, max(base - 1.0, 0.0)) + 0.35 * mask_tent(uv, max(base, 0.0)) + 0.2 * mask_tent(uv, base + 1.3);
    float core = src(uv, 0.0).a;
    float g = knee(m * 1.25 * intensity) * 1.1;
    float hotc = core * hot * smoothstep(0.55, 1.0, heat);
    return vec4(tint * g + i.c1.rgb * hotc * intensity * 0.6, min(g * occl, 1.0));
  }
  if (c.variant == 0) {
    float out_g = bloom(c.d, radius, reach);
    float in_g = inner * 0.7 * exp(min(c.d, 0.0) / (0.4 * radius));
    float gl = mix(in_g, out_g, edge);
    float corew = gauss(max(c.d, 0.0), 0.3 * radius) * hot * smoothstep(0.6, 1.0, heat);
    vec3 col = mix(tint, i.c1.rgb, corew * 0.8);
    float e = knee(gl * intensity * 1.1);
    light = col * e; alpha = e * occl;
  } else if (c.variant == 1) {
    float w = max(i.p2.y, c.aa * 0.75);
    float core = gauss(c.d, w);
    float out_g = bloom(c.d, radius, reach) * edge;
    float in_g = inner * bloom(-c.d, radius * 0.6, reach) * (1.0 - edge);
    vec3 corec = mix(tint, i.c1.rgb, 0.7 * hot * smoothstep(0.5, 1.0, heat));
    float e = knee((out_g + in_g) * intensity);
    light = corec * core * 1.4 * intensity + tint * e * 0.9;
    alpha = core * 0.6 * intensity + e * occl;
  } else {
    vec2 pr = rrect_perim(c.q, c.hf, c.r);
    float u = pr.x / pr.y;
    float flow = c.reduced ? 0.0 : c.t * i.p2.x;
    vec3 col = aura_palette(u - flow, tint, i.c1.rgb, i.c2.rgb);
    float wob = 0.85 + 0.15 * pgnoise(vec2(u * 6.0, flow * 1.7 + 3.0), 6, c.seed);
    float out_g = bloom(c.d, radius, reach) * edge;
    float in_g = inner * exp(min(c.d, 0.0) / (0.55 * radius)) * (1.0 - edge);
    float hair = gauss(c.d + 0.6, max(i.p2.y, c.aa)) * 0.9;
    float lit = knee((out_g + in_g) * wob * intensity * 1.1);
    light = col * lit + mix(col, vec3(1.0), 0.6) * hair * intensity * hot;
    alpha = lit * occl;
  }
  return finish(vec4(light, alpha), px);
}
`

export const PULSE = /* glsl */ `
// variant: 0 radar, 1 breathe, 2 heartbeat, 3 ping, 4 ripple. c0 colour, c1 core
// p0 (count, period, reach, width) p1 (intensity, t0, duration, repeat) p2 (travel, lag, head radius, occlusion) aux origin/dir
float shoot(float u) { float x = clamp(u, 0.0, 1.0); float m = 1.0 - x; return 3.0 * m * m * x * (-0.12) + 3.0 * m * x * x + x * x * x; }
float beat_env(float x) { return x < 0.0 ? exp(-(x / 0.018) * (x / 0.018)) : exp(-x / 0.085); }
vec2 ping(Ctx c, float age, float dur) {
  vec2 o = i.aux.xy; vec2 dir = normalize(i.aux.zw); float travel = i.p2.x; float head_r = i.p2.z;
  if (age < 0.0) return vec2(0.0);
  float u = age / dur;
  if (c.reduced) {
    vec2 dest = o + dir * travel;
    float env = smoothstep(0.0, 0.2, age) * exp(-max(age - 0.2, 0.0) * 3.0);
    return vec2(env * gauss(length(c.p - dest), head_r * 3.0), 0.0);
  }
  vec2 hpos = o + dir * travel * shoot(u); vec2 tpos = o + dir * travel * shoot(u - i.p2.y);
  vec2 sd = segdist(c.p, tpos, hpos);
  float cool = exp(-max(u - 1.0, 0.0) * 3.5);
  float hr = head_r * (1.0 + 0.9 * (1.0 - cool));
  float tailw = head_r * 0.55 * (0.35 + 0.65 * sd.y);
  float tail = gauss(sd.x, tailw) * sd.y * sd.y * 0.8;
  float dh = length(c.p - hpos);
  float head = gauss(dh, hr) + 0.35 * bloom(dh - hr * 0.5, hr * 1.2, hr * 8.0);
  float e = (head + tail) * cool;
  float hot = gauss(dh, hr * 0.45) * cool * cool;
  float fr = 26.0 * (1.0 - exp(-age * 7.0));
  e += exp(-age * 10.0) * smoothstep(0.0, 0.03, age) * gauss(length(c.p - o) - fr, 2.0 + age * 6.0) * 0.5;
  return vec2(e, hot);
}
vec4 shade(vec2 px) {
  Ctx c = ctx(px);
  int n = int(i.p0.x + 0.5); float period = max(i.p0.y, 0.05); float reach = i.p0.z; float width = i.p0.w;
  float inten = i.p1.x; float occl = i.p2.w;
  float outside = smoothstep(-c.aa, c.aa, c.d);
  float e = 0.0; float hotv = 0.0;
  if (c.variant == 0) {
    if (c.reduced) e = 0.35 * bloom(c.d, reach * 0.18, reach * 0.8);
    else {
      for (int k = 0; k < n; k++) {
        float ph = fract(c.t / period + float(k) / float(n));
        float r = reach * (1.0 - pow(1.0 - ph, 2.2));
        float w = width * (1.0 + 2.2 * ph);
        float a = pow(1.0 - ph, 1.6) * smoothstep(0.0, 0.08, ph);
        float ring = gauss(c.d - r, w);
        float wash = smoothstep(r + w, r - w, c.d) * exp(-(r - c.d) / max(reach * 0.22, 1.0));
        e += a * (ring + 0.22 * wash);
      }
      e += 0.18 * bloom(c.d, reach * 0.1, reach * 0.6);
    }
    e *= outside;
  } else if (c.variant == 1) {
    float b = 0.5;
    if (!c.reduced) { b = 0.5 - 0.5 * cos(TAU * c.t / period); b = b * b * (3.0 - 2.0 * b); }
    float r = reach * (0.55 + 0.45 * b);
    e = (0.45 + 0.55 * b) * bloom(c.d, r, r * 5.0) * outside;
    hotv = 0.25 * b * gauss(max(c.d, 0.0), r * 0.25);
  } else if (c.variant == 2) {
    float beat = 0.3; float ring = 0.0;
    if (!c.reduced) {
      float tp = c.t / period; float kb = floor(tp); beat = 0.0;
      for (int k = -1; k < 3; k++) {
        float x = tp - (kb - float(k));
        beat += beat_env(x) + 0.62 * beat_env(x - 0.17);
        float age = x * period;
        if (age > 0.0) {
          float rr = reach * (1.0 - exp(-age * 4.5));
          ring += exp(-age * 3.2) * smoothstep(0.0, 0.03, age) * (1.0 - smoothstep(0.7, 1.3, age)) * gauss(c.d - rr, width * (1.0 + age * 3.0));
        }
      }
      float edge = reach + width * 16.0;
      ring *= 1.0 - smoothstep(edge * 0.8, edge, c.d);
    }
    float r = reach * 0.22 * (1.0 + 0.35 * beat);
    e = ((0.25 + 0.75 * beat) * bloom(c.d, r, reach) + 0.55 * ring) * outside;
    hotv = 0.35 * beat * gauss(max(c.d, 0.0), r * 0.25) * outside;
  } else if (c.variant == 3) {
    float dur = max(i.p1.z, 0.05); float age0 = c.t - i.p1.y;
    int shots = 1; float age = age0;
    if (i.p1.w > 0.0 && age0 > 0.0) { age = age0 - floor(age0 / i.p1.w) * i.p1.w; shots = 3; }
    for (int k = 0; k < shots; k++) {
      float a = age + float(k) * i.p1.w;
      if (a > age0 + 1e-4 || a > dur * 2.2) break;
      vec2 pe = ping(c, a, dur);
      e += pe.x; hotv += pe.y;
    }
  } else {
    float dur = max(i.p1.z, 0.05); float age = c.t - i.p1.y;
    if (age >= 0.0 && age < dur) {
      float u = age / dur; float r = length(c.p - i.aux.xy);
      float inside = smoothstep(c.aa, -c.aa, c.d);
      if (c.reduced) e = 0.06 * (1.0 - u) * smoothstep(0.0, 0.08, u) * inside;
      else {
        float rr = reach * (1.0 - pow(1.0 - u, 3.0)); float w = width * (1.0 + 3.0 * u);
        float fade = pow(1.0 - u, 1.5);
        float ring = gauss(r - rr, w) * fade * 0.55;
        float fill = smoothstep(rr + w, rr - w * 3.0, r) * 0.05 * (1.0 - u) * (1.0 - u) * smoothstep(0.0, 0.05, u);
        e = (ring * 0.7 + fill) * inside; hotv = ring * 0.1 * inside;
      }
    }
  }
  vec3 col = i.c0.rgb * e + i.c1.rgb * hotv;
  return finish(vec4(col * inten, (e + hotv) * occl * inten), px);
}
`

export const ELECTRIC = /* glsl */ `
// variant: 0 arc A -> B, 1 border, 2 charged. Bolt paths and forks are CPU tables; xf = (first, N, forks, strands).
// c0 glow, c1 core, c2 cooled fork  p0 (amplitude, frequency, speed, core width) p1 (intensity, glow, forks, flicker) p2 (strands, gap, fork len, occlusion)
struct Bolt { float core; float halo; };
Bolt shade_bolt(float dist, float w, float gr) {
  Bolt b; b.core = gauss(dist, w); float o = dist / gr;
  b.halo = 0.35 / (1.0 + o * o) * (1.0 - smoothstep(gr * 2.5, gr * 5.0, dist)) + 0.65 * gauss(dist, gr * 0.6);
  return b;
}
float lat(float dv, float a, float b, float stp) { float s = (b - a) / stp; float k = inversesqrt(1.0 + min(s * s, 3.0)); return dv * mix(k, 1.0, smoothstep(1.5, 8.0, abs(dv))); }
vec3 fork_col(float heat) { return mix(mix(i.c2.rgb, i.c0.rgb, smoothstep(0.0, 0.5, heat)), i.c1.rgb, smoothstep(0.6, 1.0, heat)); }
vec4 shade(vec2 px) {
  Ctx c = ctx(px);
  float w = max(i.p0.w, c.aa * 0.7); float inten = i.p1.x; float gr = max(i.p1.y, 1e-3); float gap = i.p2.y;
  uint first = uint(i.xf.x); uint n = uint(i.xf.y); uint nf = uint(i.xf.z); uint ns = uint(i.xf.w);
  uint q4 = n >> 2u; vec4 fl = dat(first + 1u); uint base = first + 2u;
  float core = 0.0; float halo = 0.0; vec3 fork_hot = vec3(0.0);
  if (c.variant == 0) {
    vec2 a = i.aux.xy; vec2 bb = i.aux.zw;
    float L = max(length(bb - a), 1.0); vec2 dir = (bb - a) / L; vec2 nrm = vec2(-dir.y, dir.x);
    vec2 rel = c.p - a; float u = dot(rel, dir) / L; float v = dot(rel, nrm); float uc = clamp(u, 0.0, 1.0);
    float fi = uc * float(n - 1u); uint i0 = min(uint(fi), n - 2u); float f = fi - float(i0); float stp = L / float(n - 1u);
    for (uint k = 0u; k < ns; k++) {
      uint sb = base + k * q4;
      float d0 = dat1(sb, i0); float d1 = dat1(sb, i0 + 1u);
      float dd = length(vec2((u - uc) * L, lat(v - mix(d0, d1, f), d0, d1, stp)));
      uint hb = base + (ns + k) * q4;
      float dh = length(vec2((u - uc) * L, v - mix(dat1(hb, i0), dat1(hb, i0 + 1u), f)));
      float bw = k == 0u ? w : w * 0.6;
      Bolt bo = shade_bolt(dd, bw, gr);
      bo.halo = 0.4 * shade_bolt(dh, bw, gr).halo + 0.6 * shade_bolt(dd, bw, gr * 0.3).halo;
      float kb = (k == 0u ? 1.0 : 0.32) * fl[int(k)];
      core += bo.core * kb; halo += bo.halo * kb;
    }
    halo += 0.6 * (gauss(length(c.p - a), gr * 0.8) + gauss(length(c.p - bb), gr * 0.8));
    core += 0.5 * (gauss(length(c.p - a), w * 2.5) + gauss(length(c.p - bb), w * 2.5));
    uint fb = base + 2u * ns * q4;
    for (uint j = 0u; j < nf; j++) {
      vec4 h0 = dat(fb); vec4 h1 = dat(fb + 1u);
      vec2 o = h0.xy; vec2 fd = h0.zw; float len = h1.x;
      vec2 fr = c.p - o; float fu = dot(fr, fd) / len; float fv = dot(fr, vec2(-fd.y, fd.x));
      float fuc = clamp(fu, 0.0, h1.y); float ffi = fuc * 15.0; uint j0 = min(uint(ffi), 14u);
      float s0 = dat1(fb + 2u, j0); float s1 = dat1(fb + 2u, j0 + 1u);
      float fdist = length(vec2((fu - fuc) * len, lat(fv - mix(s0, s1, ffi - float(j0)), s0, s1, len / 15.0)));
      float taper = 1.0 - 0.7 * fuc;
      Bolt bo = shade_bolt(fdist, w * 0.6 * taper, gr * 0.55);
      fork_hot += fork_col(h1.w) * (bo.core * 1.1 + bo.halo * 0.45) * h1.z * taper;
      fb += 6u;
    }
  } else {
    vec2 pr = rrect_perim(c.q, c.hf, c.r); float s = pr.x; float total = pr.y; bool calm = c.variant == 2;
    float fi = s / total * float(n); uint i0 = uint(floor(fi)) % n; uint i1 = (i0 + 1u) % n; float f = fi - floor(fi); float stp = total / float(n);
    for (uint k = 0u; k < ns; k++) {
      uint sb = base + k * q4;
      float d0 = dat1(sb, i0); float d1 = dat1(sb, i1);
      float dd = abs(lat(c.d - gap - mix(d0, d1, f), d0, d1, stp));
      uint hb = base + (ns + k) * q4;
      float dh = abs(c.d - gap - mix(dat1(hb, i0), dat1(hb, i1), f));
      uint cb = base + (2u * ns + k) * q4;
      float crawlv = mix(dat1(cb, i0), dat1(cb, i1), f);
      float bw = k == 0u ? w : w * 0.6;
      Bolt bo = shade_bolt(dd, bw, gr);
      bo.halo = 0.4 * shade_bolt(dh, bw, gr).halo + 0.6 * shade_bolt(dd, bw, gr * 0.3).halo;
      float kb = (k == 0u ? 1.0 : 0.32) * fl[int(k)] * crawlv;
      core += bo.core * kb; halo += bo.halo * kb;
    }
    if (calm) {
      float sp = i.p0.z * 0.35;
      float bu = fract(s / total - c.t * 0.07 * sp);
      for (int k = 0; k < 3; k++) {
        float x = fract(bu - float(k) / 3.0 + 0.5) - 0.5;
        float bead = gauss(x * total, 18.0);
        halo += bead * gauss(c.d - gap, gr * 0.8) * 0.9;
        core += bead * gauss(c.d - gap, w * 1.5) * 0.6;
      }
    }
    uint fb = base + 3u * ns * q4;
    for (uint j = 0u; j < nf; j++) {
      vec4 h0 = dat(fb); vec4 h1 = dat(fb + 1u);
      float len = h1.x;
      float dsv = s - h0.x; dsv -= total * round(dsv / total);
      float fu = (c.d - gap - h0.z) / len; float fuc = clamp(fu, 0.0, h1.y);
      float ffi = fuc * 15.0; uint j0 = min(uint(ffi), 14u);
      float s0 = dat1(fb + 2u, j0); float s1 = dat1(fb + 2u, j0 + 1u);
      float fdist = length(vec2((fu - fuc) * len, lat(dsv - mix(s0, s1, ffi - float(j0)), s0, s1, len / 15.0)));
      float taper = 1.0 - 0.7 * fuc;
      Bolt bo = shade_bolt(fdist, w * 0.6 * taper, gr * 0.55);
      fork_hot += fork_col(h1.w) * (bo.core * 1.1 + bo.halo * 0.45) * h1.z * taper;
      fb += 6u;
    }
  }
  vec3 rgb = (i.c1.rgb * core * 1.3 + i.c0.rgb * halo * 0.75 + fork_hot) * inten;
  float a = (core * 0.7 + halo * i.p2.w + lum(fork_hot) * 0.5) * inten;
  return finish(vec4(rgb, a), px);
}
`

export const FIRE = /* glsl */ `
// variant: 0 flames off the top edge (also heat), 1 plasma border, 3 embers only.
// c0 low, c1 mid, c2 hot  p0 (height, scale, speed, intensity) p1 (embers, rise, size, life) p2 (warp, sides, base glow, occlusion) p3 (swirl)
vec3 fire_ramp(float T, vec3 c0, vec3 c1, vec3 c2) {
  vec3 col = mix(vec3(0.012, 0.009, 0.008), c0, smoothstep(0.04, 0.22, T));
  col = mix(col, c1, smoothstep(0.2, 0.5, T)); col = mix(col, c2, smoothstep(0.45, 0.78, T));
  return mix(col, vec3(1.0, 0.92, 0.74), smoothstep(0.8, 1.08, T));
}
float fbm4(vec2 p0, uint seed) { vec2 p = p0; float a = 0.5; float s = 0.0; for (uint o = 0u; o < 4u; o++) { s += a * gnoise(p, seed + o * 131u); p = ROT * p * 2.03; a *= 0.5; } return s / 0.9375; }
vec4 flames(Ctx c) {
  float H = i.p0.x; float sc = max(i.p0.y, 1.0); float tr = c.t * i.p0.z;
  vec2 nrm = sd_grad(c); float up = clamp(-nrm.y, 0.0, 1.0);
  float span = smoothstep(c.hf.x + 2.0, c.hf.x - c.r * 0.9 - 2.0, abs(c.q.x));
  float hl = H * smoothstep(0.15, 0.95, up) * span;
  if (hl < 0.5) return vec4(0.0);
  float y = c.d + 1.5; float yn = y / hl;
  if (yn > 1.6 || yn < -0.2) return vec4(0.0);
  float x = c.p.x / sc;
  float fl = 1.0 + 0.2 * gnoise(vec2(x * 0.45, c.t * 1.3), c.seed + 7u) + 0.07 * gnoise(vec2(x * 1.1 + 9.0, c.t * 8.0), c.seed + 8u);
  float yh = yn / max(fl, 0.4);
  vec2 sw = vec2(0.0);
  if (i.p3.x > 0.0) sw = i.p3.x * vec2(sin(y / sc * 0.7 + tr * 0.4), 0.0);
  vec2 wq = vec2(x * 0.7, y / sc * 0.45 - tr * 1.05);
  vec2 w = vec2(gnoise(wq, c.seed), gnoise(wq + vec2(3.7, 1.9), c.seed + 1u)) * i.p2.x * (0.2 + 0.8 * yh);
  float n = fbm4(vec2(x * 1.05, y / sc * 0.5 - tr * 1.6) + w + sw, c.seed + 2u);
  float dens = (1.0 - yh) * 1.2 + n * 0.8 - 0.08;
  float body = smoothstep(0.0, 0.06, dens) * smoothstep(-0.2, 0.05, yn);
  float T = clamp(dens * (0.95 - 0.5 * yh), 0.0, 1.1);
  vec3 col = fire_ramp(T, i.c0.rgb, i.c1.rgb, i.c2.rgb);
  float e = body * (0.3 + 0.75 * T * T);
  vec3 emis = col * e;
  float smoke = smoothstep(-0.32, -0.02, dens) * (1.0 - body) * smoothstep(0.35, 0.9, yh) * 0.12;
  float bg = i.p2.z * 0.22 * exp(-max(c.d, 0.0) / max(hl * 0.12, 1.0)) * smoothstep(-1.0, 0.5, c.d) * span;
  emis += i.c1.rgb * bg;
  return vec4(emis, body * i.p2.w + smoke);
}
vec3 blackbody(float k) {
  float t = k / 100.0;
  float g = clamp((99.4708 * log(t) - 161.1196) / 255.0, 0.0, 1.0);
  float b = t <= 19.0 ? 0.0 : clamp((138.5177 * log(max(t - 10.0, 1.0)) - 305.0448) / 255.0, 0.0, 1.0);
  return to_lin(vec3(1.0, g, b));
}
vec3 flame_light(float T, float gain) { float x = max(T, 0.0); float e = gain * x * x * x * smoothstep(0.08, 0.3, x); return vec3(1.0) - exp(-blackbody(1000.0 + 1700.0 * min(x, 1.3)) * e); }
vec4 plasma(Ctx c) {
  float sc = max(i.p0.y, 1.0); float thick = max(i.p0.x * i.p2.y * 0.3, 2.5);
  vec2 pr = rrect_perim(c.q, c.hf, c.r); float u = pr.x / pr.y; float d = c.d - thick * 0.45;
  if (abs(d) > thick * 4.0) return vec4(0.0);
  float P = max(round(pr.y / (sc * 2.5)), 3.0);
  float flow = c.t * i.p0.z * (0.35 + 0.25 * i.p3.x);
  float warp = 0.6 * pgnoise(vec2(u * P - flow * 0.6, c.t * 0.35), int(P), c.seed + 3u);
  float r1 = 1.0 - abs(pgnoise(vec2(u * P - flow * 1.4, d / sc * 3.2 + warp), int(P), c.seed));
  float r2 = 1.0 - abs(pgnoise(vec2(u * P * 2.0 + flow * 1.1, d / sc * 4.5 - warp - c.t * 0.6), int(P * 2.0), c.seed + 1u));
  float fil = pow(max(r1, 0.0), 10.0) + 0.45 * pow(max(r2, 0.0), 12.0);
  float breathe = 0.78 + 0.22 * pgnoise(vec2(u * 3.0 - c.t * 0.25, c.t * 0.2), 3, c.seed + 5u);
  float env = exp(-(d * d) / (thick * thick));
  float halo = exp(-max(d, 0.0) / (thick * 0.9)) * smoothstep(-thick, 0.0, d);
  float E = env * (0.18 + 1.2 * fil) * breathe;
  vec3 rgb = i.c0.rgb * halo * 0.28 + i.c1.rgb * E * 0.55 + i.c2.rgb * fil * env * breathe * 0.9 + vec3(1.0) * pow(fil, 3.0) * env * breathe * 0.35;
  return vec4(rgb, (E * 0.5 + halo * 0.1) * i.p2.w * 2.0);
}
vec4 shade(vec2 px) {
  Ctx c = ctx(px);
  float inten = i.p0.w;
  vec4 o = vec4(0.0);
  if (c.variant == 0) o = flames(c); else if (c.variant == 1) o = plasma(c);
  vec3 emis = o.rgb; float alpha = o.a;
  uint ef = uint(i.xf.x); uint en = uint(i.xf.y);
  for (uint k = 0u; k < en; k++) {
    vec4 a = dat(ef + k * 2u); vec4 b = dat(ef + k * 2u + 1u);
    vec2 sd = segdist(c.p, a.xy - a.zw, a.xy);
    float T = b.y; float core = gauss(sd.x, b.x); float halo = gauss(sd.x, b.x * 3.0) * 0.12;
    emis += flame_light(0.45 + T * 0.75, 6.0) * (core * 1.4 + halo) * T;
    alpha += core * T * 0.5;
  }
  return finish(vec4(emis * inten, min(alpha, 1.0) * inten), px);
}
`

export const EXTRAS = /* glsl */ `
// variant: 0 shimmer / sheen, 1 sparkles, 2 aurora, 3 grain.
float cover(Ctx c, float feather) { return smoothstep(c.aa * 0.5, -max(feather, c.aa), c.d); }
vec4 shade(vec2 px) {
  Ctx c = ctx(px);
  if (c.variant == 0) {
    float m = i.p1.x > 0.5 ? src((c.p - i.aux2.xy) / i.aux2.zw, 0.0).a : cover(c, max(i.p1.z, c.aa * 1.5));
    if (m <= 0.0) return vec4(0.0);
    float ta = tan(i.p0.z);
    float span = c.hf.x + c.hf.y * abs(ta) + i.p0.y * 2.5;
    float x = c.q.x + c.q.y * ta;
    float sheen;
    if (c.reduced) sheen = 0.35 * (0.5 - 0.5 * cos(TAU * c.t / max(i.p0.x, 0.1)));
    else {
      float ph = fract(c.t / max(i.p0.x, 0.1));
      float travel = clamp(ph / max(1.0 - i.p1.y, 0.05), 0.0, 1.0);
      float e = travel * travel * (3.0 - 2.0 * travel);
      float xc = mix(-span, span, e);
      sheen = gauss(x - xc, i.p0.y) + 0.35 * gauss(x - xc, i.p0.y * 2.6);
    }
    vec3 base = i.c1.rgb * i.c1.a;
    return finish(vec4(base * m + i.c0.rgb * sheen * i.p0.w * m, i.c1.a * m + sheen * i.p0.w * m * 0.2), px);
  }
  if (c.variant == 1) {
    uint f0 = uint(i.xf.x); uint n = uint(i.xf.y);
    float body = 0.0; float hot = 0.0; float halo = 0.0;
    for (uint k = 0u; k < n; k++) {
      vec4 a = dat(f0 + k * 2u); vec4 b = dat(f0 + k * 2u + 1u);
      float S = max(a.z, 0.01); float env = a.w; vec2 rel = c.p - a.xy; float r = length(rel);
      if (r > S * 1.6) continue;
      vec2 l = vec2(b.x * rel.x - b.y * rel.y, b.y * rel.x + b.x * rel.y);
      vec2 ax = max(abs(l) / S, vec2(1e-6));
      float g = pow(pow(ax.x, 0.55) + pow(ax.y, 0.55), 1.0 / 0.55);
      float w = c.aa * 0.75 / S;
      float m = 1.0 - smoothstep(1.0 - w, 1.0 + w, g);
      body += env * m; hot += env * m * (1.0 - g) * (1.0 - g); halo += env * gauss(r, S * 0.32);
    }
    vec3 tint = i.c0.rgb;
    vec3 col = mix(tint, vec3(1.0), 0.3) * body + vec3(1.0) * hot * 0.8 + tint * halo * 0.12;
    return finish(vec4(col * i.p0.w, min(body * 0.9 + halo * 0.05, 1.0) * i.p0.w), px);
  }
  if (c.variant == 2) {
    float m = cover(c, max(i.p0.w, c.aa));
    if (m <= 0.0) return vec4(0.0);
    float sc = max(i.p0.x, 1.0); vec2 q = c.p / sc;
    float t = c.reduced ? 0.0 : c.t * i.p0.y;
    float uy = (c.p.y - i.rect.y) / i.rect.w;
    vec3 col = vec3(0.0);
    vec3 cols[3] = vec3[3](i.c0.rgb, i.c1.rgb, i.c2.rgb);
    uint f0 = uint(i.xf.x); uint ns = uint(i.xf.y);
    float fx = clamp((c.p.x - i.rect.x) / i.rect.z, 0.0, 1.0) * float(ns - 1u);
    uint x0 = min(uint(fx), ns - 2u); float fr = fx - float(x0);
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      uint yb = f0 + uint(k) * 2u * (ns >> 2u); uint wb = yb + (ns >> 2u);
      float wv = mix(dat1(wb, x0), dat1(wb, x0 + 1u), fr);
      float yk = mix(dat1(yb, x0), dat1(yb, x0 + 1u), fr);
      float band = gauss(uy - yk, 0.13 + 0.05 * fk);
      float rays = 0.65 + 0.35 * gnoise(vec2(q.x * 5.0 + wv * 3.0, t * 0.5 + fk), c.seed + 9u);
      float hem = smoothstep(yk + 0.16, yk - 0.02, uy) * 0.5 + 0.5;
      col += cols[k] * band * rays * hem;
    }
    float a = min(max(col.r, max(col.g, col.b)), 1.0);
    return finish(vec4(col * i.p0.z * m, a * i.p0.z * m), px);
  }
  float m = cover(c, max(i.p0.z, c.aa));
  if (m <= 0.0) return vec4(0.0);
  uint frame = 0u;
  if (i.p0.y > 0.0 && !c.reduced) frame = uint(floor(c.t * i.p0.y));
  uvec2 ip = uvec2(px);
  float n = u01(ip.x + pcg(ip.y + pcg(frame + c.seed))) + u01(ip.y * 7919u + pcg(ip.x + 17u + frame)) - 1.0;
  float a = i.p0.x * m;
  if (n >= 0.0) return vec4(vec3(n * a), n * a);
  return vec4(0.0, 0.0, 0.0, -n * a);
}
`
