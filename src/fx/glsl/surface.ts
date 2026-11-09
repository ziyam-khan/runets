// Surface effects ported from rune-fx (MIT, Anomaly): distort.wgsl (heat haze, shockwave, liquid-glass
// lens, CRT, chromatic split) and fill.wgsl (liquid metal, mesh gradient, dither, grain gradient,
// fluted glass, metaballs, swirl, voronoi, waves, halftone, plastic). The backdrop is the image the
// page hands the layer; its mip chain stands in for the original's dual-filter blur pyramid.

export const DISTORT = /* glsl */ `
vec3 frosted(vec3 c, float k) { float l = lum(c); vec3 sat = max(mix(vec3(l), c, 1.0 + 0.9 * k), vec3(0.0)); vec3 e = to_srgb(sat); return to_lin(e * (1.0 - 0.32 * k) + vec3(0.11 * k)); }
float lens_sd(Ctx c, vec2 q) {
  float da = sd_rrect(q, c.hf, c.r);
  if (i.p3.z <= 0.0) return da;
  vec2 cb = i.p3.xy + i.p3.zw * 0.5 - c.c;
  float db = sd_rrect(q - cb, i.p3.zw * 0.5, i.p2.w);
  return mix(smin(da, db, i.p2.z), db, i.shape.w);
}
float bend_at(float t) {
  float u = clamp(1.0 - t, 0.0, 0.9999); float pw = 3.0;
  float slope = pow(u, pw - 1.0) * pow(max(1.0 - pow(u, pw), 1e-6), 1.0 / pw - 1.0);
  float tilt = atan(min(slope, 1e4)); float bent = asin(sin(tilt) / 1.5);
  return tan(tilt - bent);
}
vec4 shade(vec2 px) {
  Ctx c = ctx(px); float s = c.scale;
  if (c.variant == 0) {
    float H = i.p0.x; float m;
    if (i.p1.x > 0.5) m = smoothstep(c.aa, -c.aa * 8.0, c.d);
    else {
      float above = i.rect.y - c.p.y;
      float side = smoothstep(c.hf.x + 2.0, c.hf.x - c.r - 4.0, abs(c.q.x));
      m = smoothstep(1.0, 1.0 + H * 0.3, above) * (1.0 - smoothstep(H * 0.45, H, above)) * side;
    }
    if (m <= 0.0) return vec4(0.0);
    float t = c.reduced ? 0.0 : c.t;
    vec2 q = c.p / max(i.p0.y, 1.0) + vec2(0.0, t * i.p0.z);
    vec2 o = vec2(fbm3(q, c.seed), fbm3(q * vec2(1.0, 0.7) + vec2(7.3, 2.1), c.seed + 5u)) * i.p0.w;
    return vec4(bd(c.p + o * m, s).rgb, 1.0) * smoothstep(0.0, 0.02, m);
  }
  if (c.variant == 1) {
    float age = c.t - i.p1.x; float dur = max(i.p1.y, 0.05);
    if (age < 0.0 || age > dur) return vec4(0.0);
    float u = age / dur; vec2 rel = c.p - i.aux.xy; float r = length(rel); vec2 dir = rel / max(r, 1e-3);
    float fade = (1.0 - u) * (1.0 - u);
    if (c.reduced) { float gl = gauss(r, i.p0.x * 0.25) * 0.12 * fade * smoothstep(0.0, 0.1, u); return vec4(bd(c.p, s).rgb * gl, 0.0); }
    float R = i.p0.x * (1.0 - pow(1.0 - u, 2.6)); float w = i.p0.y * (1.0 + 1.5 * u);
    float x = (r - R) / w; float f = x * exp(-x * x) * 2.33;
    vec2 off = -dir * f * i.p0.z * fade; float ca = i.p0.w * abs(f) * fade;
    float rr = bd(c.p + off * (1.0 + ca), s).r; float gg = bd(c.p + off, s).g; float bb = bd(c.p + off * (1.0 - ca), s).b;
    float lit = max(-f, 0.0) * 0.12 * fade * lum(vec3(rr, gg, bb));
    float m = smoothstep(0.0, 0.01, abs(f) * fade);
    return vec4(vec3(rr, gg, bb) + lit, 1.0) * m;
  }
  if (c.variant == 2) {
    float d = lens_sd(c, c.q); float presence = i.p1.x; float e = 0.5;
    float gx = lens_sd(c, c.q + vec2(e, 0.0)) - lens_sd(c, c.q - vec2(e, 0.0));
    float gy = lens_sd(c, c.q + vec2(0.0, e)) - lens_sd(c, c.q - vec2(0.0, e));
    vec2 nrm = vec2(gx, gy) / max(length(vec2(gx, gy)), 1e-5);
    float coverage = clamp(0.5 - d * s, 0.0, 1.0);
    float sd = lens_sd(c, c.q - vec2(0.0, 5.0 * presence));
    float fall = exp(-pow(max(sd + 2.0, 0.0), 2.0) / (2.0 * 9.0 * 9.0));
    float contact = exp(-pow(max(d, 0.0), 2.0) / 6.0);
    float dark = min(i.p1.z * presence * (0.55 * fall + 0.45 * contact), 1.0) * (1.0 - coverage);
    if (coverage <= 0.0) return vec4(0.0, 0.0, 0.0, dark);
    float depth = -d; float bevel = max(i.p0.x, 0.5); float tt = clamp(depth / bevel, 0.0, 1.0);
    float bend = i.p0.y * bend_at(tt) * presence; float mag = mix(1.0, i.p0.w, presence);
    vec2 ctr = c.c; vec2 inward = -nrm; float dsp = i.p0.z; vec2 local = c.p - ctr;
    vec2 srcg = ctr + (local + inward * bend) / mag;
    vec2 srcr = ctr + (local + inward * bend * (1.0 - dsp)) / mag;
    vec2 srcb = ctr + (local + inward * bend * (1.0 + dsp)) / mag;
    vec3 col = vec3(bd(srcr, s).r, bd(srcg, s).g, bd(srcb, s).b);
    float frost = i.p1.y;
    if (frost > 0.0 && i.xf.x > 0.5) {
      vec3 blr = vec3(bdb(srcr, s).r, bdb(srcg, s).g, bdb(srcb, s).b);
      col = mix(col, blr, i.xf.y);
      float k = presence * smoothstep(0.0, 0.6, frost);
      col = frosted(col, k);
    } else {
      float rim = bend / max(1.118 * i.p0.y, 1e-3);
      float soften = min(pow(rim, 1.5) * 0.55, 1.0);
      if (soften > 1e-3 || frost > 0.0) {
        float rad = mix(1.2, 10.0, frost); float j = ign(px) * TAU; vec3 acc = vec3(0.0);
        for (int k = 0; k < 8; k++) { float a = j + float(k) * 2.39996; float rr = rad * sqrt((float(k) + 0.5) / 8.0); acc += bd(srcg + vec2(cos(a), sin(a)) * rr, s).rgb; }
        col = mix(col, acc / 8.0, clamp(max(soften, frost), 0.0, 1.0));
      }
    }
    col = mix(col, col * i.c0.rgb, i.p2.y * presence);
    float la = i.p2.x; vec2 L = vec2(cos(la), sin(la));
    float facing = max(dot(nrm, L), 0.0); float away = max(-dot(nrm, L), 0.0);
    float sky = clamp(0.5 - 0.5 * c.q.y / c.hf.y, 0.0, 1.0);
    float fres = pow(1.0 - tt, 3.0) * 0.05 * (0.25 + 0.75 * sky);
    float line = gauss(depth - 0.75, 0.55); float glow = gauss(depth - 1.4, 2.4);
    float spec = line * (0.9 * pow(facing, 2.5) + 0.35 * pow(away, 3.0)) + glow * 0.1 * pow(facing, 4.0);
    float inner = gauss(tt - 0.32, 0.18) * away * away * 0.06;
    float edge = gauss(depth - 0.3, 0.45) * 0.12;
    float light = (0.004 + fres + spec + inner + edge) * presence * i.p1.w;
    col = col * (1.0 - 0.04 * presence) + vec3(light);
    vec3 base = bd(c.p, s).rgb * (1.0 - dark);
    return vec4(mix(base, col, coverage), 1.0);
  }
  if (c.variant == 3) {
    float feather = max(i.p1.w, c.aa);
    float m = smoothstep(feather * 0.5, -feather * 0.5, c.d);
    if (m <= 0.0) return vec4(0.0);
    vec2 uv = c.q / c.hf; float k = i.p0.x;
    vec2 bu = uv * (1.0 + k * dot(uv, uv)) / (1.0 + k);
    float inside = smoothstep(1.0, 0.985, max(abs(bu.x), abs(bu.y)));
    vec2 sp = c.c + bu * c.hf; float ca = i.p0.w;
    vec3 col = vec3(bd(sp + vec2(ca, 0.0), s).r, bd(sp, s).g, bd(sp - vec2(ca, 0.0), s).b);
    float gw = 3.0;
    vec3 gl = (bd(sp + vec2(gw, 0.0), s).rgb + bd(sp - vec2(gw, 0.0), s).rgb + bd(sp + vec2(0.0, gw), s).rgb + bd(sp - vec2(0.0, gw), s).rgb) * 0.25;
    col += gl * i.p1.y;
    float per = max(i.p0.y, 3.0 * c.aa);
    float sl = 0.5 + 0.5 * cos(TAU * (c.p.y - i.rect.y) / per);
    col *= 1.0 - i.p0.z * (1.0 - sl);
    uint col3 = uint(floor(px.x)) % 3u;
    vec3 grille = col3 == 0u ? vec3(1.0, 0.94, 0.94) : (col3 == 1u ? vec3(0.94, 1.0, 0.94) : vec3(0.94, 0.94, 1.0));
    col *= grille;
    float roll = c.reduced ? 0.0 : gauss(fract((c.p.y - i.rect.y) / i.rect.w - c.t * 0.12) - 0.5, 0.06) * i.p1.z;
    col += vec3(roll) * 0.06;
    col *= 1.0 - i.p1.x * pow(dot(uv, uv) * 0.5, 1.5);
    col *= inside;
    return vec4(col, 1.0) * m;
  }
  float feather = max(i.p0.w, c.aa);
  float m = smoothstep(feather * 0.5, -feather * 0.5, c.d);
  if (m <= 0.0) return vec4(0.0);
  vec2 o = i.p0.xy; float gx = 0.0;
  if (i.p0.z > 0.0 && !c.reduced) {
    float slice = floor((c.p.y - i.rect.y) / 6.0); float fr = floor(c.t * 12.0);
    uint hsl = hu(c.seed + uint(int(slice)), uint(int(fr)));
    if (u01(hsl) < 0.12 * i.p0.z) gx = (u01(hsl + 1u) - 0.5) * 16.0 * i.p0.z;
  }
  vec2 p = c.p + vec2(gx, 0.0);
  vec3 col = vec3(bd(p + o, s).r, bd(p, s).g, bd(p - o, s).b);
  return vec4(col, 1.0) * m;
}
`

export const FILL = /* glsl */ `
// variant: 0 liquid metal, 1 mesh, 2 dither, 3 grain gradient, 4 fluted glass, 5 metaballs, 6 swirl, 7 voronoi, 8 waves, 9 halftone, 10 plastic.
// aux = (border pt, intensity). Colour stops in the table: data[xf.x + 2k] linear rgb (w: point x), data[xf.x + 2k + 1] OKLab (w: point y).
float fill_mask(Ctx c, float border) {
  float inside = clamp(0.5 - c.d * c.scale, 0.0, 1.0);
  if (border <= 0.0) return inside;
  return inside * clamp(0.5 + (c.d + border) * c.scale, 0.0, 1.0);
}
vec2 rot2(vec2 v, float a) { float cs = cos(a); float sn = sin(a); return vec2(cs * v.x - sn * v.y, sn * v.x + cs * v.y); }
vec3 stop_lin(uint f0, uint k) { return dat(f0 + 2u * k).rgb; }
vec3 stop_lab(uint f0, uint k) { return dat(f0 + 2u * k + 1u).rgb; }
vec2 stop_pt(uint f0, uint k) { return vec2(dat(f0 + 2u * k).w, dat(f0 + 2u * k + 1u).w); }
vec3 oklab_to_lin(vec3 c) {
  float l = c.x + 0.39633778 * c.y + 0.21580376 * c.z; float m = c.x - 0.10556135 * c.y - 0.06385417 * c.z; float s = c.x - 0.08948418 * c.y - 1.29148555 * c.z;
  float l3 = l * l * l; float m3 = m * m * m; float s3 = s * s * s;
  return max(vec3(4.07674166 * l3 - 3.30771159 * m3 + 0.23096993 * s3, -1.26843800 * l3 + 2.60975740 * m3 - 0.34131940 * s3, -0.00419609 * l3 - 0.70341861 * m3 + 1.70761470 * s3), vec3(0.0));
}
vec3 palette_ramp(uint f0, uint n, float x) {
  if (n <= 1u) return stop_lin(f0, 0u);
  float fx = clamp(x, 0.0, 1.0) * float(n - 1u); uint k = min(uint(fx), n - 2u);
  return oklab_to_lin(mix(stop_lab(f0, k), stop_lab(f0, k + 1u), fx - float(k)));
}
vec3 ramp_loop(uint f0, uint n, float x) {
  if (n <= 1u) return stop_lin(f0, 0u);
  float fx = fract(x) * float(n); uint k = min(uint(fx), n - 1u);
  return oklab_to_lin(mix(stop_lab(f0, k), stop_lab(f0, (k + 1u) % n), fx - float(k)));
}
vec4 paint(vec3 col, float m, vec2 px) { float a = m * clamp(i.aux.y, 0.0, 1.0); return finish(vec4(col * a, a), px); }
float tone_at(Ctx c, vec2 p, int kind, float angle) {
  float v; vec2 q = p - c.c;
  if (kind == 0) { vec2 dir = vec2(cos(angle), sin(angle)); float ext = abs(c.hf.x * dir.x) + abs(c.hf.y * dir.y); v = dot(q, dir) / max(ext, 1e-3) * 0.5 + 0.5; }
  else if (kind == 1) v = 1.0 - clamp(length(q / max(c.hf, vec2(1e-3))) / 1.3, 0.0, 1.0);
  else if (kind == 2) { float t = c.t * i.p1.y; v = 0.5 + 0.62 * fbm3(p / max(i.p1.x, 1.0) + vec2(t * 0.31, t * 0.17), c.seed); }
  else if (kind == 3) v = to_srgb(vec3(lum(bd(p, c.scale).rgb))).x;
  else v = to_srgb(vec3(lum(to_lin(src((p - i.aux2.xy) / max(i.aux2.zw, vec2(1e-3)), 0.0).rgb)))).x;
  return clamp((v - 0.5) * i.p1.w + 0.5 + i.p1.z * 0.5, 0.0, 1.0);
}
float bayer(uvec2 cell, uint bits) {
  uint v = 0u;
  for (uint b = 0u; b < bits; b++) { uint x = (cell.x >> b) & 1u; uint y = (cell.y >> b) & 1u; uint sh = 2u * (bits - 1u - b); v |= (((x ^ y) << 1u) | y) << sh; }
  return (float(v) + 0.5) / float(1u << (2u * bits));
}
vec3 slab_tilt(Ctx c, float border, float bevel, float dome) {
  float depth = -c.d; vec2 gv = sd_grad(c); vec2 tilt = vec2(0.0); float rim = 0.0;
  if (border > 0.0) { float x = clamp((depth - border * 0.5) / max(border * 0.5, 1e-3), -0.97, 0.97); tilt = -gv * x / sqrt(1.0 - x * x); rim = abs(x); }
  else { float bev = max(bevel, 0.5); float x = clamp(1.0 - depth / bev, 0.0, 0.92); tilt = gv * x / sqrt(1.0 - x * x); rim = x; }
  vec2 qn = c.q / max(c.hf, vec2(1.0));
  tilt += vec2(qn.x * 0.55, qn.y) * dome * (border > 0.0 ? 0.25 : 0.8);
  return vec3(tilt, rim);
}
float flow_h(vec2 u, vec2 w, float t, uint seed) { vec2 p = u + w; return gnoise(p + vec2(0.0, t * 0.11), seed + 3u) + 0.5 * gnoise(ROT * p * 2.03 - vec2(t * 0.07, 0.0), seed + 17u); }
vec3 studio(vec3 r, float contrast) {
  float up = -r.y; float e = up + 0.1; float w = 0.014;
  float sky = 0.2 + 0.6 * exp(-max(e, 0.0) * 3.2) + 0.45 * exp(-max(e, 0.0) * 24.0);
  float key = smoothstep(0.80, 0.95, dot(r, normalize(vec3(-0.3, -0.82, 0.5)))) * 2.4;
  float strip = gauss(r.x - 0.6, 0.075) * smoothstep(-0.05, 0.2, e) * (1.0 - smoothstep(0.55, 0.9, up)) * 1.7;
  float fill_l = gauss(r.x + 0.72, 0.045) * smoothstep(0.0, 0.25, e) * (1.0 - smoothstep(0.4, 0.8, up)) * 0.55;
  float lights = (key + strip + fill_l) * contrast;
  float fl = smoothstep(0.05, 1.0, -e);
  float pool = 0.16 * gauss(r.x + 0.25, 0.35) * smoothstep(0.25, 0.9, -e);
  float ground = (0.014 + 0.3 * fl * fl + pool + 0.05 * gauss(e + 0.06, 0.04)) / (contrast * contrast);
  float h = smoothstep(-w, w, e);
  vec3 skyc = (sky * mix(1.0, 0.82, clamp(contrast - 1.0, 0.0, 1.0)) + lights) * vec3(0.97, 0.99, 1.03);
  return mix(ground * vec3(1.04, 1.0, 0.95), skyc, h);
}
vec3 shoulder(vec3 c) { float k = 0.78; return mix(c, k + (1.0 - k) * (1.0 - exp(-(c - k) / (1.0 - k))), greaterThan(c, vec3(k))); }
vec4 liquid_metal(Ctx c, float m, vec2 px) {
  float flow = i.p0.x; float sc = max(i.p0.y, 1.0); float t = c.t * i.p0.z;
  vec3 slab = slab_tilt(c, i.aux.x, i.p0.w, i.p1.x); vec2 tilt = slab.xy; float rim = slab.z;
  float hgt = 0.0; float bend = 0.0;
  if (flow > 0.0) {
    vec2 u = (i.p2.x > 0.5 ? c.q : c.p) / sc;
    vec2 wv = vec2(gnoise(u * 0.6 + vec2(t * 0.05, 1.7), c.seed + 7u), gnoise(u * 0.6 + vec2(4.3, -t * 0.06), c.seed + 11u)) * 0.9;
    float e = 0.04;
    hgt = flow_h(u, wv, t, c.seed);
    float hx = flow_h(u + vec2(e, 0.0), wv, t, c.seed) - hgt; float hy = flow_h(u + vec2(0.0, e), wv, t, c.seed) - hgt;
    vec2 g = vec2(hx, hy) / e;
    float k = flow * 0.42 * (1.0 - 0.6 * rim * rim);
    tilt -= g * k; bend = length(g) * k;
  }
  vec3 n = normalize(vec3(tilt, 1.0));
  vec3 r = vec3(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0);
  r = vec3(rot2(r.xy, i.p1.y), r.z);
  vec3 env = studio(normalize(r), max(i.p1.w, 0.1)) * i.c1.rgb;
  vec3 f0 = i.c0.rgb; float cz = clamp(1.0 - n.z, 0.0, 1.0); float cz2 = cz * cz;
  vec3 f = f0 + (vec3(1.0) - f0) * (cz2 * cz2 * cz);
  float ir = i.p1.z;
  if (ir > 0.0) {
    float ph = 1.6 * (1.0 - n.z) + 0.35 * hgt;
    vec3 film = 0.5 + 0.5 * cos(TAU * (vec3(ph) + vec3(0.0, 0.33, 0.67)));
    float k = ir * clamp(smoothstep(0.04, 0.45, 1.0 - n.z) + bend * 0.8, 0.0, 1.0);
    f *= mix(vec3(1.0), 0.55 + 0.9 * film, k);
  }
  return paint(shoulder(f * env), m, px);
}
vec4 plastic(Ctx c, float m, vec2 px) {
  vec3 slab = slab_tilt(c, i.aux.x, i.p0.z, i.p0.y);
  vec3 n = normalize(vec3(slab.xy, 1.0));
  vec3 l = vec3(rot2(vec2(0.0, -1.0), i.p0.w) * 0.6428, 0.766);
  float nl = dot(n, l);
  vec3 base = clamp(i.c0.rgb, vec3(0.0), vec3(1.0));
  float sh = 0.4 + 0.7833 * max(nl, 0.0);
  vec3 col = mix(base * min(sh, 1.0), vec3(1.0), clamp((sh - 1.0) * 0.6, 0.0, 1.0));
  float rough = clamp(i.p0.x, 0.02, 1.0); float a = min(rough * rough + 0.1, 1.0); float a2 = a * a;
  vec3 h = normalize(l + vec3(0.0, 0.0, 1.0)); float nh = max(dot(n, h), 0.0);
  float dd = nh * nh * (a2 - 1.0) + 1.0; float ndf = a2 / (PI * dd * dd);
  float fh = 1.0 - h.z;
  float spec = ndf * (0.04 + 0.96 * fh * fh * fh * fh * fh) * max(nl, 0.0) * 2.5;
  float fz = 1.0 - clamp(n.z, 0.0, 1.0);
  float sky = 0.55 + 0.45 * smoothstep(-0.5, 0.5, -n.y);
  float edge = 0.96 * fz * fz * fz * fz * fz * sky * (1.0 - 0.5 * rough);
  col += (vec3(1.0) - col) * knee(spec + edge);
  return paint(col, m, px);
}
vec4 fluted(Ctx c, float m, vec2 px) {
  float s = c.scale; float rib = max(i.p0.x, 1.0); vec2 across = vec2(cos(i.p0.y), sin(i.p0.y));
  float u = dot(c.p - c.c, across) / rib; float local = fract(u) - 0.5; float x = local * 2.0;
  float o = -x * (1.0 + 0.35 * x * x) * i.p0.z; float dsp = i.p1.x * 0.3 * abs(x);
  vec2 srcg = c.p + across * o; vec2 srcr = c.p + across * o * (1.0 + dsp); vec2 srcb = c.p + across * o * (1.0 - dsp);
  vec3 col = vec3(bd(srcr, s).r, bd(srcg, s).g, bd(srcb, s).b);
  float frost = i.p0.w;
  if (frost > 0.0) {
    if (i.xf.x > 0.5) col = mix(col, vec3(bdb(srcr, s).r, bdb(srcg, s).g, bdb(srcb, s).b), i.xf.y);
    else {
      vec2 along = vec2(-across.y, across.x); float j = ign(px) - 0.5; vec3 acc = vec3(0.0);
      for (int k = 0; k < 4; k++) acc += bd(srcg + along * (float(k) - 1.5 + j) * 3.0 * frost, s).rgb;
      col = mix(col, acc * 0.25, frost);
    }
    float k = smoothstep(0.0, 0.6, frost); float l = lum(col);
    vec3 sat = max(mix(vec3(l), col, 1.0 + 0.5 * k), vec3(0.0));
    col = to_lin(to_srgb(sat) * (1.0 - 0.2 * k) + vec3(0.07 * k));
  }
  col = mix(col, col * i.c0.rgb, i.p1.z);
  float hl = i.p1.y; float aa = c.aa / rib;
  float groove = 1.0 - smoothstep(0.0, max(0.06, aa * 2.0), 0.5 - abs(local));
  float sheen = gauss(local + 0.22, 0.13) * 0.1 + gauss(local + 0.34, 0.03) * 0.1;
  float lip = gauss(local - 0.44, max(0.025, aa)) * 0.06;
  float lift = 0.35 + 0.65 * sqrt(clamp(lum(col), 0.0, 1.0));
  col = col * (1.0 - 0.28 * hl * groove) + vec3((sheen + lip) * hl * lift);
  float a = m * clamp(i.aux.y, 0.0, 1.0);
  return vec4(col * a, a);
}
vec4 mesh_gradient(Ctx c, float m, vec2 px) {
  uint f0 = uint(i.xf.x); uint n = uint(i.xf.y);
  vec2 uv = (c.p - i.rect.xy) / max(i.rect.zw, vec2(1.0)); float t = c.t * i.p0.y; float warp = i.p0.w;
  if (warp > 0.0) uv += warp * 0.09 * vec2(gnoise(uv * 2.1 + vec2(t * 0.11, 0.0), c.seed + 5u), gnoise(uv * 2.1 + vec2(3.7, -t * 0.09), c.seed + 9u));
  vec2 aspect = i.rect.zw / max(max(i.rect.z, i.rect.w), 1.0);
  float sharp = clamp(i.p0.z, 0.1, 8.0);
  vec3 lab = vec3(0.0); float wsum = 0.0;
  for (uint k = 0u; k < n; k++) { vec2 d = (uv - stop_pt(f0, k)) * aspect; float w = pow(dot(d, d) + 0.004, -sharp); lab += stop_lab(f0, k) * w; wsum += w; }
  return paint(oklab_to_lin(lab / max(wsum, 1e-6)), m, px);
}
vec4 dither(Ctx c, float m) {
  uint f0 = uint(i.xf.x); uint n = max(uint(i.xf.y), 1u); float pix = max(i.p0.z, 0.25);
  vec2 cell = floor((c.p - i.rect.xy) / pix); uvec2 ci = uvec2(ivec2(cell));
  float tone = tone_at(c, i.rect.xy + (cell + 0.5) * pix, int(i.p0.y + 0.5), i.p0.w);
  int pat = clamp(int(i.p0.x + 0.5), 1, 5); float th;
  if (pat <= 3) th = bayer(ci, uint(pat));
  else if (pat == 4) { uint side = max(uint(i.xf.w), 1u); th = dat1(uint(i.xf.z), (ci.y % side) * side + ci.x % side); }
  else th = u01(ci.x * 7919u + pcg(ci.y + c.seed));
  float lv = float(max(n, 2u) - 1u); float v = tone * lv;
  uint k = min(uint(floor(v) + (fract(v) > th ? 1.0 : 0.0)), n - 1u);
  float a = m * clamp(i.aux.y, 0.0, 1.0);
  return vec4(stop_lin(f0, k) * a, a);
}
vec4 grain_gradient(Ctx c, float m, vec2 px) {
  uint f0 = uint(i.xf.x); uint n = uint(i.xf.y); int kind = int(i.p0.x + 0.5); float ang = i.p0.y;
  vec2 ctr = i.rect.xy + i.p0.zw * i.rect.zw; float x;
  if (kind == 0) { vec2 dir = vec2(cos(ang), sin(ang)); float ext = abs(c.hf.x * dir.x) + abs(c.hf.y * dir.y); x = dot(c.q, dir) / max(ext, 1e-3) * 0.5 + 0.5; }
  else if (kind == 1) x = length(c.p - ctr) / max(length(c.hf), 1e-3);
  else { vec2 d = c.p - ctr; float th = (d.x != 0.0 || d.y != 0.0) ? atan(d.y, d.x) : 0.0; x = fract((th - ang) / TAU); }
  float amount = i.p1.x; float size = max(i.p1.y, 0.25);
  uint frame = i.p1.w > 0.0 ? uint(floor(c.t * i.p1.w)) : 0u;
  uvec2 gc = uvec2(ivec2(floor((c.p - i.rect.xy) / size)));
  uint h = pcg(gc.x + pcg(gc.y + pcg(frame + c.seed * 977u)));
  float nx = u01(h) + u01(h + 1u) - 1.0;
  vec3 col = kind == 2 ? ramp_loop(f0, n, x + nx * amount * 0.2) : palette_ramp(f0, n, x + nx * amount * 0.2);
  float nb = u01(h + 2u) + u01(h + 3u) - 1.0;
  if (i.p1.z > 0.5) col *= 1.0 + nb * amount * 0.18;
  else col *= vec3(1.0) + vec3(nb, u01(h + 4u) + u01(h + 5u) - 1.0, u01(h + 6u) + u01(h + 7u) - 1.0) * amount * 0.18;
  return paint(col, m, px);
}
vec4 metaballs(Ctx c, float m, vec2 px) {
  uint f0 = uint(i.xf.x); uint b0 = uint(i.xf.z); uint nb = uint(i.xf.w);
  float field = 0.0; vec2 g = vec2(0.0); vec3 lab = vec3(0.0); float rsum = 0.0;
  for (uint k = 0u; k < nb; k++) {
    vec4 b = dat(b0 + k); vec2 d = c.p - b.xy; float r2 = b.z * b.z; float dd = dot(d, d) + 1e-3; float f = r2 / dd;
    field += f; g += -2.0 * f / dd * d; lab += stop_lab(f0, uint(b.w)) * f; rsum += b.z * f;
  }
  vec3 base = i.c0.rgb;
  vec3 col = field > 1e-5 ? oklab_to_lin(lab / max(field, 1e-6)) : base;
  float ravg = rsum / max(field, 1e-6);
  float cv = field > 1e-3 ? clamp(0.5 + (field - 1.0) * ravg * 0.5 * c.scale, 0.0, 1.0) : 0.0;
  float steep = 1.0 - smoothstep(1.0, 2.6, field);
  vec2 nxy = -g / sqrt(dot(g, g) + 1e-6) * steep * 0.9;
  vec3 nrm = normalize(vec3(nxy, 1.0)); vec3 l = normalize(vec3(-0.45, -0.6, 0.66));
  float diff = max(dot(nrm, l), 0.0);
  float spec = pow(max(dot(reflect(-l, nrm), vec3(0.0, 0.0, 1.0)), 1e-4), 28.0);
  vec3 body = col * (0.6 + 0.5 * diff) + vec3(spec * i.p0.w * 0.8);
  vec3 halo = col * smoothstep(0.25, 1.0, field) * 0.18;
  return paint(mix(base + halo, body, cv), m, px);
}
vec4 swirl(Ctx c, float m, vec2 px) {
  uint f0 = uint(i.xf.x); uint n = uint(i.xf.y); float sc = max(i.p0.x, 1.0); float t = c.t * i.p0.y;
  float rr = length(c.q) / max(min(c.hf.x, c.hf.y), 1.0);
  vec2 q = rot2(c.q, i.p0.z * TAU * exp(-rr * rr * 0.8)) / sc;
  vec2 w1 = vec2(fbm3(q + vec2(t * 0.1, 0.0), c.seed), fbm3(q + vec2(5.2, 1.3 - t * 0.08), c.seed + 3u));
  float v = fbm3(q + w1 * i.p0.w * 1.5 + vec2(0.0, t * 0.05), c.seed + 7u);
  return paint(palette_ramp(f0, n, 0.5 + 0.75 * v), m, px);
}
vec4 voronoi(Ctx c, float m, vec2 px) {
  uint f0 = uint(i.xf.x); uint n = uint(i.xf.y); float sc = max(i.p0.x, 2.0); float t = c.t * i.p0.y;
  float t0 = fract(t * (1.0 / TAU)) * TAU; float t1 = fract(t * (0.8 / TAU)) * TAU;
  vec2 p = (c.p - i.rect.xy) / sc; vec2 ip = floor(p);
  float best = 8.0; ivec2 bc = ivec2(0); vec2 bo = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    ivec2 cc = ivec2(ip) + ivec2(x, y); float h = hcell(cc, c.seed); float h2 = hcell(cc, c.seed + 1u);
    vec2 o = vec2(0.5) + 0.38 * vec2(sin(t0 + TAU * h), cos(t1 + TAU * h2)); vec2 d = vec2(cc) + o - p; float dd = dot(d, d);
    if (dd < best) { best = dd; bc = cc; bo = d; }
  }
  float edge = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    if (x == 0 && y == 0) continue;
    ivec2 cc = bc + ivec2(x, y); float h = hcell(cc, c.seed); float h2 = hcell(cc, c.seed + 1u);
    vec2 o = vec2(0.5) + 0.38 * vec2(sin(t0 + TAU * h), cos(t1 + TAU * h2)); vec2 d = vec2(cc) + o - p; vec2 dv = d - bo;
    if (dot(dv, dv) > 1e-6) edge = min(edge, dot(0.5 * (bo + d), normalize(dv)));
  }
  uint k = uint(hcell(bc, c.seed + 2u) * float(n)) % max(n, 1u);
  vec3 col = stop_lin(f0, k) * (1.0 - i.p0.w * 0.55 * clamp(best * 1.6, 0.0, 1.0));
  float seam = i.p0.z * 0.5;
  if (seam > 0.0) col = mix(i.c0.rgb, col, clamp(0.5 + (edge * sc - seam) * c.scale, 0.0, 1.0));
  return paint(col, m, px);
}
vec4 waves(Ctx c, float m, vec2 px) {
  uint f0 = uint(i.xf.x); uint n = uint(i.xf.y); float ang = i.p0.w;
  vec2 dir = vec2(-sin(ang), cos(ang)); vec2 along = vec2(cos(ang), sin(ang));
  float ext = abs(c.hf.x * dir.x) + abs(c.hf.y * dir.y); float ext2 = abs(c.hf.x * along.x) + abs(c.hf.y * along.y);
  float v = dot(c.q, dir) / max(2.0 * ext, 1e-3) + 0.5; float s = dot(c.q, along) / max(2.0 * ext2, 1e-3) + 0.5;
  float soft = max(i.p1.x, c.aa / max(2.0 * ext, 1e-3)); float t = c.t * i.p0.z;
  vec3 col = stop_lin(f0, 0u);
  for (uint k = 1u; k < n; k++) {
    float fk = float(k); float h = hcell(ivec2(int(k), 3), c.seed); float fq = i.p0.y * (0.8 + 0.4 * h);
    float ph1 = fract(t * 0.2 * (1.0 + 0.3 * fk) + h); float ph2 = fract(-t * 0.13) * TAU + 1.7 * fk;
    float y = fk / float(n) + i.p0.x * (0.7 * sin(TAU * (fq * s + ph1)) + 0.3 * sin(TAU * fq * 2.3 * s + ph2));
    float sh = exp(-max(y - v, 0.0) / 0.025) * 0.18 * step(v, y);
    col *= 1.0 - sh;
    col = mix(col, stop_lin(f0, k), smoothstep(y - soft, y + soft, v));
  }
  return paint(col, m, px);
}
vec4 halftone(Ctx c, float m, vec2 px) {
  float pitch = max(i.p0.z, 1.0); float ang = i.p2.x;
  vec2 r = rot2(c.p - c.c, -ang) / pitch; vec2 base = floor(r - 0.5); int kind = int(i.p0.y + 0.5); float ink = 0.0;
  for (int y = 0; y <= 1; y++) for (int x = 0; x <= 1; x++) {
    vec2 cc = base + vec2(float(x), float(y)) + 0.5; vec2 w = c.c + rot2(cc * pitch, ang);
    float cv = 1.0 - tone_at(c, w, kind, i.p0.w); float rad = sqrt(cv / PI) * 1.12;
    float d = (length(r - cc) - rad) * pitch;
    ink = max(ink, clamp(0.5 - d * c.scale, 0.0, 1.0));
  }
  return paint(mix(i.c1.rgb, i.c0.rgb, ink), m, px);
}
vec4 shade(vec2 px) {
  Ctx c = ctx(px);
  float m = fill_mask(c, i.aux.x);
  if (m <= 0.0) return vec4(0.0);
  if (c.variant == 0) return liquid_metal(c, m, px);
  if (c.variant == 1) return mesh_gradient(c, m, px);
  if (c.variant == 2) return dither(c, m);
  if (c.variant == 3) return grain_gradient(c, m, px);
  if (c.variant == 4) return fluted(c, m, px);
  if (c.variant == 5) return metaballs(c, m, px);
  if (c.variant == 6) return swirl(c, m, px);
  if (c.variant == 7) return voronoi(c, m, px);
  if (c.variant == 8) return waves(c, m, px);
  if (c.variant == 9) return halftone(c, m, px);
  return plastic(c, m, px);
}
`
