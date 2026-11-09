// Weather over a painted scene, written for this site in rune-fx's manner (pure function of pixel,
// time and seed; integer hashes; premultiplied light). The scene image is the backdrop: drops on the
// glass refract it, the storm takes its colour. The scene's skyline (a CPU table) keeps meteors and the
// storm behind the land.
// variant: 0 rain, 1 snow, 2 meteors, 3 sandstorm.
// c0 tint, c1 accent  p0 (intensity, wind, speed, density)  p1 (t0 scene start, night, lens drops, ground)
// xf (skyline first, skyline samples, _, _); u_bdx maps canvas uv to image uv (object-fit: cover).
export const WEATHER = /* glsl */ `
vec2 imguv(vec2 px) { return px / u_size * u_bdx.xy + u_bdx.zw; }
float skyline(float x) {
  uint n = uint(i.xf.y); if (n < 2u) return 2.0;
  float fx = clamp(x, 0.0, 1.0) * float(n - 1u); uint k = min(uint(fx), n - 2u);
  return mix(dat1(uint(i.xf.x), k), dat1(uint(i.xf.x), k + 1u), fx - float(k));
}
// 1 in the sky, 0 on the land; a soft edge of about a point.
float skymask(vec2 px, float feather) { vec2 uv = imguv(px); return smoothstep(0.0, feather, skyline(uv.x) - uv.y); }
float h2(int x, int y, uint s) { return hcell(ivec2(x, y), s); }

// ---------- rain ----------
// One layer of streaks falling along +y in rotated space: a few lit columns, each with drops spaced by its period.
float rain_layer(vec2 p, float t, float cell, float len, float speed, float th, float keep, uint seed) {
  float cx = floor(p.x / cell); int ix = int(cx);
  float period = len * (2.6 + 3.4 * h2(ix, 1, seed));
  float y = p.y - t * speed * (0.85 + 0.3 * h2(ix, 0, seed)) + h2(ix, 2, seed) * period;
  float k = floor(y / period); float local = y - k * period;
  if (h2(ix, int(k), seed + 7u) > keep || local > len) return 0.0;
  float x0 = (cx + 0.15 + 0.7 * h2(ix, int(k), seed + 3u)) * cell;
  float s = local / len;
  return gauss(p.x - x0, th) * smoothstep(0.0, 0.85, s) * (1.0 - smoothstep(0.93, 1.0, s));
}
// A water drop on the glass: (refracted sample point, coverage, rim). v is the offset in drop radii.
vec4 drop_at(vec2 p, vec2 c, float r, float aa) {
  vec2 v = (p - c) / r; v.y *= 1.18;
  float d = length(v);
  float cv = smoothstep(1.0, 1.0 - 2.0 * aa / r, d);
  // A drop is a tiny fisheye: it shows the scene upside down and shrunk, from a patch about four radii wide.
  return vec4(c - (p - c) * 4.0 * (1.0 + 0.35 * d * d), cv, d);
}
vec4 glass(vec2 p, float t, vec2 px, float amount, float aa, uint seed) {
  vec4 best = vec4(0.0);
  // Sliding drops: columns of tall cells that slip down in surges; each drop leaves a trail of beads that stay put.
  float W = 120.0; float H = 260.0;
  float cx = floor(p.x / W); int ix = int(cx);
  float hs = h2(ix, 0, seed + 41u);
  float sp = 26.0 + 34.0 * hs;
  float drift = sp * (t + 0.34 * sin(t * 1.7 + hs * 6.0)) + hs * H;
  float yy = p.y - drift; float cy = floor(yy / H);
  for (int k = 0; k < 2; k++) {
    int iy = int(cy) - k;
    float hk = h2(ix, iy, seed + 43u);
    if (hk > amount) continue;
    float r = 6.0 + 5.0 * h2(ix, iy, seed + 47u);
    vec2 c = vec2((cx + 0.25 + 0.5 * h2(ix, iy, seed + 53u)) * W, (float(iy) + 0.5) * H + drift);
    c.x += 3.0 * sin((c.y) * 0.035 + hk * 9.0);
    vec4 dr = drop_at(p, c, r, aa);
    if (dr.z > best.z) best = dr;
    // The trail: small beads every 9 pt above the drop, fading with height and with time since it passed.
    float above = c.y - p.y;
    if (above > r && above < 150.0) {
      float by = floor(p.y / 9.0);
      float hb = h2(ix * 31 + 7, int(by), seed + 59u);
      if (hb < 0.75) {
        float fade = 1.0 - above / 150.0;
        float br = (1.0 + 1.6 * hb) * fade;
        vec2 bc = vec2(c.x + (hb - 0.37) * 5.0, (by + 0.5) * 9.0);
        if (br > 0.4) { vec4 b = drop_at(p, bc, br, aa); if (b.z > best.z) best = b; }
      }
    }
  }
  // Still droplets that bead up and evaporate.
  float S = 30.0; vec2 g = floor(p / S); int gx = int(g.x); int gy = int(g.y);
  float hz = h2(gx, gy, seed + 61u);
  if (hz < 0.24 * amount) {
    float life = fract(t / (7.0 + 5.0 * hz) + hz * 13.0);
    float r = (0.9 + 2.4 * h2(gx, gy, seed + 67u)) * smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.75, 1.0, life));
    vec2 c = (g + 0.2 + 0.6 * vec2(h2(gx, gy, seed + 71u), h2(gx, gy, seed + 73u))) * S;
    if (r > 0.5) { vec4 b = drop_at(p, c, r, aa); if (b.z > best.z) best = b; }
  }
  return best;
}
vec4 rain(Ctx c, vec2 px) {
  float t = c.t * i.p0.z; float inten = i.p0.x; float night = i.p1.y;
  float ang = 0.16 + 0.1 * i.p0.y;
  vec2 q = vec2(cos(ang) * c.p.x + sin(ang) * c.p.y, -sin(ang) * c.p.x + cos(ang) * c.p.y);
  float dens = i.p0.w;
  float s = rain_layer(q, t, 9.0, 34.0, 720.0, 0.55, 0.28 * dens, c.seed)
          + 0.8 * rain_layer(q + vec2(3.1, 0.0), t, 14.0, 62.0, 1050.0, 0.8, 0.3 * dens, c.seed + 11u)
          + 0.65 * rain_layer(q + vec2(7.7, 0.0), t, 26.0, 120.0, 1500.0, 1.25, 0.26 * dens, c.seed + 23u);
  // Streaks catch whatever light is behind them: brighter in front of the city's glow.
  vec3 behind = bdb(c.p, c.scale);
  float catchl = 0.35 + 1.6 * lum(behind);
  vec3 col = mix(i.c0.rgb, behind * 1.6 + i.c0.rgb * 0.3, 0.45);
  vec3 light = col * s * catchl * inten;
  float alpha = s * 0.16 * inten;
  // Splashes on the wet deck in the foreground: flattened rings that open and fade.
  vec2 uv = imguv(px);
  float ground = smoothstep(i.p1.w, i.p1.w + 0.06, uv.y);
  if (ground > 0.0) {
    float S = 46.0; vec2 g = floor(c.p / S); int gx = int(g.x); int gy = int(g.y);
    float hz = h2(gx, gy, c.seed + 81u);
    float per = 0.55 + 0.6 * hz; float ph = fract(t / per + hz * 7.0); float life = 0.32;
    if (ph * per < life && hz < 0.8 * dens) {
      float u = ph * per / life;
      vec2 sc = (g + 0.2 + 0.6 * vec2(h2(gx, gy, c.seed + 83u), h2(gx, gy, c.seed + 89u))) * S;
      vec2 d = c.p - sc; d.y *= 3.2;
      float rr = 2.0 + 9.0 * (1.0 - (1.0 - u) * (1.0 - u));
      float ring = gauss(length(d) - rr, 0.7 + 0.6 * u) * (1.0 - u);
      float crown = gauss(length(c.p - sc - vec2(0.0, -6.0 * u)), 1.0) * (1.0 - u) * 0.6;
      light += (i.c0.rgb + behind) * (ring + crown) * 0.9 * ground * inten;
      alpha += (ring + crown) * 0.25 * ground * inten;
    }
  }
  // Water on the glass, refracting an upside-down view of the scene.
  if (i.p1.z > 0.0) {
    vec4 g = glass(c.p, c.t, px, i.p1.z, c.aa, c.seed + 101u);
    if (g.z > 0.0) {
      vec3 seen = bd(g.xy, c.scale).rgb;
      // A drop: the scene upside down and a little brighter (it gathers light), a dark outline where the
      // surface turns away, a bright crescent at the bottom where light focuses, a specular glint up top.
      vec2 dirv = normalize(-(c.p - g.xy) + 1e-4);
      seen = seen * 1.25 + 0.03;
      float outline = smoothstep(0.7, 0.98, g.w);
      seen *= 1.0 - 0.6 * outline;
      float crescent = smoothstep(0.55, 0.9, g.w) * smoothstep(0.2, 0.9, -dirv.y) * (1.0 - smoothstep(0.92, 1.0, g.w));
      float glint = gauss(length(-dirv * g.w - vec2(-0.32, -0.42)), 0.13);
      seen += vec3(0.92, 0.97, 1.0) * (crescent * 0.35 + glint * 0.75);
      light = mix(light, seen, g.z); alpha = mix(alpha, 1.0, g.z * 0.96);
    }
  }
  return vec4(light, min(alpha, 1.0));
}

// ---------- snow ----------
// One layer of flakes on a grid that falls and drifts with the wind; each flake sways inside its cell.
vec2 snow_layer(vec2 p, float t, float cell, float r, float fall, float drift, float keep, float blur, uint seed) {
  vec2 q = p - vec2(drift, t * fall);
  vec2 g = floor(q / cell); int gx = int(g.x); int gy = int(g.y);
  float h = h2(gx, gy, seed);
  if (h > keep) return vec2(0.0);
  float sw = 0.18 * sin(t * (0.6 + 0.9 * h2(gx, gy, seed + 3u)) + h * 40.0);
  vec2 c = (g + vec2(0.28 + 0.44 * h2(gx, gy, seed + 5u) + sw, 0.28 + 0.44 * h2(gx, gy, seed + 7u))) * cell;
  float rr = r * (0.6 + 0.8 * h2(gx, gy, seed + 9u));
  float d = length(q - c);
  float body = blur > 0.0 ? (gauss(d, rr * 0.9) * 0.4 + gauss(d - rr * 0.85, rr * 0.22) * 0.18) * smoothstep(rr * 1.6, rr * 0.9, d) : smoothstep(rr, rr * 0.35, d);
  return vec2(body, rr);
}
vec4 snow(Ctx c, vec2 px) {
  float t = c.t * i.p0.z; float inten = i.p0.x; float dens = i.p0.w;
  float gust = 18.0 * i.p0.y * (t + 1.4 * sin(t * 0.37) + 0.8 * sin(t * 0.91 + 1.3));
  vec2 far = snow_layer(c.p, t, 16.0, 0.75, 22.0, gust * 0.45, 0.5 * dens, 0.0, c.seed);
  vec2 mid = snow_layer(c.p + 7.0, t, 30.0, 1.4, 38.0, gust * 0.7, 0.42 * dens, 0.0, c.seed + 13u);
  vec2 near = snow_layer(c.p + 19.0, t, 58.0, 2.6, 62.0, gust, 0.34 * dens, 0.0, c.seed + 29u);
  vec2 bok = snow_layer(c.p + 53.0, t, 150.0, 9.0, 96.0, gust * 1.5, 0.22 * dens, 1.0, c.seed + 37u);
  float flakes = far.x * 0.45 + mid.x * 0.7 + near.x * 0.9;
  vec3 behind = bdb(c.p, c.scale);
  vec3 white = mix(i.c0.rgb, vec3(1.0), 0.6);
  vec3 col = white * flakes + mix(white, behind + white * 0.5, 0.25) * bok.x;
  float alpha = flakes * 0.85 + bok.x * 0.5;
  // Wind lifts fine snow along the ground.
  vec2 uv = imguv(px);
  float low = smoothstep(i.p1.w - 0.12, 0.98, uv.y);
  if (low > 0.0) {
    float n = fbm3(vec2(c.p.x / 260.0 - t * 0.22 * (0.5 + i.p0.y), c.p.y / 70.0), c.seed + 41u);
    float mist = smoothstep(0.0, 0.7, n) * low * 0.22;
    col += white * mist; alpha += mist;
  }
  // Frost creeping in from the corners of the glass: a milky, blurred pane with feathered crystals at its edge.
  vec2 e = min(c.p, vec2(i.rect.z, i.rect.w) - c.p);
  float reachf = min(i.rect.z, i.rect.w) * 0.22;
  float cd = length(max(vec2(reachf) - e, vec2(0.0))) / reachf; // 0 away from corners, rises into each corner
  float grow = smoothstep(0.0, 3.0, c.t - i.p1.x);
  if (cd > 0.0 && grow > 0.0) {
    float n1 = fbm5(c.p / 46.0, c.seed + 47u);
    float edge = cd + n1 * 0.32 - (1.0 - grow) * 0.6;
    float pane = smoothstep(0.62, 0.95, edge);
    // Crystals: ridged noise stretched along lines radiating from the corner, fine and branching.
    vec2 corner = vec2(c.p.x < i.rect.z * 0.5 ? 0.0 : i.rect.z, c.p.y < i.rect.w * 0.5 ? 0.0 : i.rect.w);
    vec2 rel = c.p - corner; float ang = atan(rel.y, rel.x); float rad = length(rel);
    float fern = pow(1.0 - abs(gnoise(vec2(ang * 34.0, rad / 26.0) + n1 * 1.6, c.seed + 53u)), 9.0)
               + 0.6 * pow(1.0 - abs(gnoise(c.p / 7.0 + n1 * 3.0, c.seed + 59u)), 14.0);
    float lace = smoothstep(0.45, 0.9, edge) * (1.0 - pane * 0.7) * fern;
    vec3 milk = mix(bdb(c.p, c.scale), vec3(0.82, 0.9, 0.96), 0.32) + vec3(0.05);
    float glint = pow(max(gnoise(c.p / 2.3, c.seed + 61u), 0.0), 18.0) * pane * 6.0;
    vec3 fc = milk * pane * 0.5 + vec3(0.9, 0.96, 1.0) * (lace * 0.4 + glint * 0.6);
    float fa = pane * 0.48 + lace * 0.28 + glint * 0.2;
    col = col * (1.0 - fa) + fc; alpha = alpha * (1.0 - fa) + fa;
  }
  return vec4(col * inten, min(alpha * inten, 1.0));
}

// ---------- meteors ----------
vec4 meteors(Ctx c, vec2 px) {
  float inten = i.p0.x; float sky = skymask(px, 0.004);
  if (sky <= 0.0) return vec4(0.0);
  float t = c.t * i.p0.z; vec3 light = vec3(0.0); float alpha = 0.0;
  // Twinkling stars: scintillation, a little colour, never all at once.
  float S = 24.0; vec2 g = floor(c.p / S); int gx = int(g.x); int gy = int(g.y);
  float hz = h2(gx, gy, c.seed + 3u);
  if (hz < 0.11 * i.p0.w) {
    vec2 sc = (g + 0.15 + 0.7 * vec2(h2(gx, gy, c.seed + 5u), h2(gx, gy, c.seed + 7u))) * S;
    float tw = 0.5 + 0.5 * sin(t * (1.5 + 4.0 * h2(gx, gy, c.seed + 9u)) + hz * 60.0);
    tw = tw * tw * tw;
    float r = 0.45 + 0.7 * h2(gx, gy, c.seed + 11u);
    vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.86, 0.72), h2(gx, gy, c.seed + 13u));
    float s = gauss(length(c.p - sc), r) * (0.25 + 0.95 * tw);
    light += tint * s; alpha += s * 0.6;
  }
  // Meteors: five staggered slots, so one crosses soon after the scene arrives and another follows.
  float tau0 = c.t - i.p1.x;
  for (int j = 0; j < 5; j++) {
    float hj = u01(c.seed + uint(j) * 977u);
    float P = 1.7 + 2.2 * hj;
    float tau = tau0 - 0.45 - float(j) * 0.7;
    if (tau < 0.0) continue;
    float k = floor(tau / P); float age = tau - k * P;
    uint hk = hu(c.seed + uint(j) * 31u, uint(int(k)));
    if (j > 0 && u01(hk) > 0.72) continue;
    float life = 0.5 + 0.55 * u01(hk + 1u);
    if (age > life) continue;
    bool ball = u01(hk + 8u) > 0.86;
    vec2 start = vec2(mix(0.22, 1.02, u01(hk + 2u)) * i.rect.z, mix(0.02, 0.36, u01(hk + 3u)) * i.rect.w);
    float ang = mix(2.38, 2.8, u01(hk + 4u));
    if (u01(hk + 5u) > 0.75) { ang = PI - ang; start.x -= 0.55 * i.rect.z; }
    vec2 dir = vec2(cos(ang), sin(ang));
    float speed = mix(620.0, 1200.0, u01(hk + 6u)) * (ball ? 0.7 : 1.0);
    float u = age / life;
    vec2 head = start + dir * speed * age;
    float tl = mix(120.0, 280.0, u01(hk + 7u)) * min(1.0, age / 0.14);
    vec2 sd = segdist(c.p, head - dir * tl, head);
    float env = smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.5, 1.0, u)) * (0.85 + 0.15 * sin(age * 90.0 + float(j)));
    float w = mix(0.45, ball ? 2.2 : 1.15, sd.y);
    float core = gauss(sd.x, w) * pow(sd.y, 1.7);
    float sheath = gauss(sd.x, w * 4.5) * pow(sd.y, 2.6) * 0.3;
    float dh = length(c.p - head);
    float hg = gauss(dh, ball ? 4.0 : 2.0) + 0.35 * gauss(dh, ball ? 22.0 : 9.0);
    vec3 tail = mix(i.c0.rgb, vec3(0.75, 0.95, 1.0), sd.y);
    vec3 hc = ball ? vec3(0.8, 1.0, 0.85) : vec3(1.0);
    float flash = ball ? gauss(dh, 170.0) * 0.07 * smoothstep(0.2, 0.5, u) * (1.0 - smoothstep(0.5, 0.9, u)) : 0.0;
    light += (tail * (core * 1.25 + sheath) + hc * hg * 1.2 + i.c1.rgb * flash) * env;
    alpha += (core * 0.6 + hg * 0.5 + flash) * env;
  }
  return vec4(light * inten * sky, min(alpha * inten, 1.0) * sky);
}

// ---------- sandstorm ----------
float streak_layer(vec2 p, float t, float rowh, float len, float speed, float th, float keep, uint seed) {
  float ry = floor(p.y / rowh); int iy = int(ry);
  float period = len * (3.0 + 4.0 * h2(1, iy, seed));
  float x = p.x - t * speed * (0.8 + 0.4 * h2(0, iy, seed)) + h2(2, iy, seed) * period;
  float k = floor(x / period); float local = x - k * period;
  if (h2(int(k), iy, seed + 5u) > keep || local > len) return 0.0;
  float y0 = (ry + 0.2 + 0.6 * h2(int(k), iy, seed + 7u)) * rowh + 3.0 * sin(local * 0.06 + float(iy));
  float s = local / len;
  return gauss(p.y - y0, th) * smoothstep(0.0, 0.7, s) * (1.0 - smoothstep(0.9, 1.0, s));
}
vec4 sandstorm(Ctx c, vec2 px) {
  float t = c.t * i.p0.z; float inten = i.p0.x; float wind = 0.5 + i.p0.y; float night = i.p1.y;
  vec2 uv = imguv(px); float sky = skyline(uv.x);
  vec3 behind = bdb(c.p, c.scale);
  vec3 sand = i.c0.rgb;
  vec3 col = vec3(0.0); float alpha = 0.0;
  // The storm wall rolling along the horizon behind the dunes: domain-warped billows with a torn top.
  float yrel = (sky - uv.y) / 0.38;
  if (yrel > -0.03 && yrel < 1.25) {
    vec2 q = vec2(c.p.x / 230.0 + t * 0.085 * wind, c.p.y / 170.0 - t * 0.02);
    vec2 w1 = vec2(fbm3(q * 1.2 + vec2(0.0, t * 0.06), c.seed + 3u), fbm3(q * 1.2 + vec2(5.2, 1.3 - t * 0.05), c.seed + 5u));
    float n = fbm5(q + w1 * 0.95, c.seed + 7u);
    float top = 0.5 + 0.38 * n;
    float dens = smoothstep(top, top - 0.42, yrel) * smoothstep(-0.03, 0.05, yrel);
    dens *= 0.5 + 0.5 * smoothstep(-0.45, 0.55, n);
    float lit = 0.55 + 0.6 * smoothstep(-0.3, 0.7, fbm3(q * 2.3 + w1, c.seed + 9u));
    vec3 wall = mix(behind, sand, 0.55) * lit + i.c1.rgb * exp(-max(yrel, 0.0) * 5.0) * night * 0.55;
    col += wall * dens * 0.95; alpha += dens * 0.95;
  }
  // Gusts: thin sheets of dust racing across everything, thicker near the ground.
  float g = fbm3(vec2(c.p.x / 380.0 - t * 0.5 * wind, c.p.y / 140.0 + t * 0.03), c.seed + 11u);
  float low = 0.35 + 0.65 * smoothstep(0.35, 1.0, uv.y);
  float sheet = smoothstep(0.05, 0.75, g) * 0.3 * low * i.p0.w;
  col += mix(sand, behind, 0.3) * sheet; alpha += sheet;
  // Grains streaming in the wind.
  float st = streak_layer(c.p, t, 7.0, 16.0, 380.0 * wind, 0.4, 0.22 * i.p0.w, c.seed + 13u)
           + 0.8 * streak_layer(c.p + vec2(0.0, 3.0), t, 13.0, 34.0, 620.0 * wind, 0.7, 0.16 * i.p0.w, c.seed + 17u);
  st *= 0.5 + 0.5 * low;
  col += mix(sand, vec3(1.0), 0.25) * st * 0.75; alpha += st * 0.62;
  return vec4(col * inten, min(alpha * inten, 1.0));
}

vec4 shade(vec2 px) {
  Ctx c = ctx(px);
  if (c.variant == 0) return rain(c, px);
  if (c.variant == 1) return snow(c, px);
  if (c.variant == 2) return meteors(c, px);
  return sandstorm(c, px);
}
`

// Light, after rune-light (MIT, Anomaly): a point light above the page, raised rounded rects that cast
// soft shadows (sphere traced through their distance field), rim light on the bevels facing the lamp.
// c0 light colour  p0 (intensity, ambient darkness, range, softness)  aux (light x, y, height, source radius)
// xf (first, count): per occluder (x, y, w, h), (radius, height, _, _).
export const LIGHT = /* glsl */ `
float scene_sd(vec2 p, float z, uint f0, uint n) {
  float d = 1e5;
  for (uint k = 0u; k < n; k++) {
    vec4 r = dat(f0 + k * 2u); vec4 m = dat(f0 + k * 2u + 1u);
    if (m.y <= z) continue;
    d = min(d, sd_rrect(p - (r.xy + r.zw * 0.5), r.zw * 0.5, m.x));
  }
  return d;
}
vec4 shade(vec2 px) {
  Ctx c = ctx(px);
  uint f0 = uint(i.xf.x); uint n = uint(i.xf.y);
  vec3 L = i.aux.xyz; float srcR = max(i.aux.w, 1.0);
  // Height of the surface under this pixel: the top of a raised element, or the page.
  float z0 = 0.0; float top = 1e5; vec2 nrm = vec2(0.0); float bevel = 0.0;
  for (uint k = 0u; k < n; k++) {
    vec4 r = dat(f0 + k * 2u); vec4 m = dat(f0 + k * 2u + 1u);
    float d = sd_rrect(c.p - (r.xy + r.zw * 0.5), r.zw * 0.5, m.x);
    if (d < 0.0 && m.y > z0) { z0 = m.y; top = d; vec2 q = c.p - (r.xy + r.zw * 0.5); float e = 0.5; nrm = normalize(vec2(sd_rrect(q + vec2(e, 0.0), r.zw * 0.5, m.x) - sd_rrect(q - vec2(e, 0.0), r.zw * 0.5, m.x), sd_rrect(q + vec2(0.0, e), r.zw * 0.5, m.x) - sd_rrect(q - vec2(0.0, e), r.zw * 0.5, m.x)) + 1e-5); }
  }
  vec3 P = vec3(c.p, z0); vec3 toL = L - P; float dist = length(toL);
  // Soft shadow: march toward the lamp; the narrowest gap seen, against the cone of the lamp's size, is the penumbra.
  float vis = 1.0;
  for (int s = 1; s <= 24; s++) {
    float u = float(s) / 24.0;
    vec3 q = P + toL * u;
    float d = scene_sd(q.xy, q.z, f0, n);
    float cone = srcR * u * i.p0.w + 0.5;
    vis = min(vis, smoothstep(-cone, cone, d));
    if (vis <= 0.0) break;
  }
  float range = max(i.p0.z, 1.0);
  float fall = 1.0 / (1.0 + (dist / range) * (dist / range));
  float lambert = clamp(toL.z / max(dist, 1e-3), 0.0, 1.0);
  float E = i.p0.x * fall * (0.35 + 0.65 * lambert) * vis;
  float rim = 0.0;
  if (top < 0.0) { float facing = max(dot(nrm, normalize(toL.xy + 1e-4)), 0.0); rim = gauss(top, 2.2) * facing * facing * fall * i.p0.x * 1.4; }
  float bulb = gauss(length(c.p - L.xy), srcR * 1.2) * 0.55 + gauss(length(c.p - L.xy), srcR * 5.0) * 0.06;
  vec3 light = i.c0.rgb * (E * 0.11 + rim * 0.5 + bulb);
  float dark = i.p0.y * (1.0 - smoothstep(0.0, 1.0, E * 0.75));
  return vec4(light, dark + lum(light) * 0.3);
}
`
