<div align="center">

# runets

**Components, springs and WebGL 2 shader effects for React, in TypeScript.**

[![Kind](https://img.shields.io/badge/kind-tool-2a78d6)](#whats-inside)
[![Status](https://img.shields.io/badge/status-0.1%2C%20early-eda100)](#status)
[![License: MIT](https://img.shields.io/badge/license-MIT-e34948)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](tsconfig.json)
[![WebGL 2](https://img.shields.io/badge/WebGL-2-990000)](#how-the-effects-run)

</div>

## Summary

runets is a TypeScript port of [Rune](https://github.com/anomalyco/rune), a GPU UI framework written in Rust. Rune draws its own frame; a web page doesn't, so runets rebuilds the parts that make Rune feel the way it does for the browser:

- every shader effect, translated from WGSL to GLSL for WebGL 2;
- their per-frame CPU tables, bit for bit;
- the component kit on accessible [Base UI](https://base-ui.com) primitives;
- the spring tokens, with their exact physics.

It also adds four weather effects and a light layer written in the same manner. The live gallery, with a page per component and knobs for every parameter, is the components page of [ziyamkhan.com](https://ziyamkhan.com/components/). That site is built with runets.

## What's inside

| Group | Contents |
|---|---|
| Motion | `instant`, `snap`, `settle`, `reflow`, `glide`, `morph`, `pop` and `drift` springs, as enter and exit pairs (duration and bounce, SwiftUI's parameterisation: ω = 2π / duration, ζ = 1 − bounce). Also `blurReplace` presence, `RollingText` and `MotionBlur` |
| Effects | Glow (soft, neon that cools, aura, mask), Pulse (radar, breathe, heartbeat, ping, ripple), Electricity (arc, border, charged), Fire (flames with embers, plasma, heat), Heat haze, Shockwave, Liquid glass, CRT, Chromatic split, Shimmer, Sparkles, Aurora, Grain |
| Fills | Liquid metal, Mesh gradient, Dither (Bayer, blue noise, white), Grain gradient, Fluted glass, Metaballs, Swirl, Voronoi, Waves, Halftone, Plastic, each with Rune's presets |
| Weather | Rain (streaks, splashes, drops on the glass refracting the scene), Snow (four depths, bokeh, frost), Shooting stars, Sandstorm. `PetalWind`: sakura petals on a 2D canvas (no GPU), stirred by the pointer |
| Light | A lamp above the page: soft shadows from raised elements, rim light on their bevels |
| Kit | Button (ten variants, three sizes, five states), IconButton, Switch, Checkbox, RadioGroup, SegmentedControl, Badge, Keybind, Spinner, Loader, Progress, ProgressCircle, TextField, Select, Combobox, ShortcutRecorder, Menu, Popover, Tooltip, HoverCard, Dialog, Toast, Card, List, Accordion, Collapsible, Shell, Tree, Table, LineageTree (which work builds on which, with elbow wires) |

## Install

runets ships as TypeScript source; your bundler compiles it (Next.js, Vite and others do so by default).

```bash
pnpm add github:ziyam-khan/runets      # or: git clone https://github.com/ziyam-khan/runets
pnpm add react react-dom motion @base-ui/react lucide-react
```

```ts
import 'runets/styles/theme.css' // the base tokens; skip it if your design system defines them
import 'runets/styles/kit.css'
```

## Use

An effect is a layer beside its parent element: a canvas covering the parent plus the room the effect needs, under or over its content.

```tsx
import { Fx, Button, Switch, snappy } from 'runets'

<button className="cta">                          {/* the parent needs position: relative */}
  Get in touch
  <Fx effect="glow" preset="Soft" />
</button>

<div className="card" onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)}>
  <Fx effect="glow" preset="Neon" hot={hot} />      {/* lights fast, cools slowly, never cuts off */}
</div>

<div className="cta">                              {/* LazyFx loads the engine after the page */}
  <LazyFx effect="glow" preset="Soft" />
</div>

<div className="badge"><Fx effect="liquid-metal" preset="Gold" /> Accepted</div>
<Fx effect="lens" backdrop="/photo.jpg" place="over" />
<Fx effect="sparkles" preset="Burst" trigger={count} place="over" />   {/* fire a one-shot */}

<Button variant="submit" size="large">Save</Button>
<Switch label="Sync" checked={on} onCheckedChange={setOn} />
<motion.div animate={{ x: 120 }} transition={snappy.enter} />
```

Every effect is data in `src/fx/effects.ts`: its defaults, Rune's presets, a knob per parameter (range, step, kind) and `pack`, which writes a layer into the shader's slots. A tuning panel, a props table and a code generator can all be built from that one definition, and the gallery's are.

## How the effects run

- **One engine, one clock.** Small canvases share one WebGL 2 context: each draws there, then is copied, so a page of fifty live effects never runs out of contexts. A full-screen canvas can own its context. One clock drives every layer. It can be pinned (`window.runetsClock.pin(t)`) for screenshots and tests, as Rune's headless renders are.
- **Deterministic.** Each frame is a pure function of pixel, time and seed. The hashes are integer PCG on the GPU and in TypeScript alike, so CPU tables and shaders agree.
- **Quiet when nothing changes.** A canvas off screen, a hidden tab, a settled one-shot or a heated glow at rest draws nothing. Under `prefers-reduced-motion`, every loop settles on one calm pose and one-shots fade in place.
- **Still without a GPU.** When WebGL runs on the CPU (SwiftShader, llvmpipe, Microsoft Basic Render Driver), every effect draws that same calm pose once and stops, and the root gets `data-gpu="none"` so your CSS can drop its blurs too. Only those renderer names count, so a real GPU, however old, keeps the motion.
- **What differs from Rune.**
  - The backdrop that glass and distortion read is an image or a painted canvas you hand the layer: a page cannot sample the frame behind an element. Its mip chain stands in for Rune's blur pyramid.
  - Light beyond coverage becomes coverage of its own hue, because a canvas cannot add light. Over dark UI this matches an additive blend.
  - Fire's GPU fluid simulation and Rune's sub-frame motion blur are not ported. Motion blur here is directional, from measured velocity.

## Status

0.1, early. It is extracted from the site it was built for, where every effect and component is in use. The API may still move.

## Credits

The effects, their presets, the kit's names and states and the motion tokens come from [Rune](https://github.com/anomalyco/rune) by Anomaly, under the MIT license. Its copyright notice is kept in [LICENSE](LICENSE), as the license requires. The weather effects, the light layer, petal wind, the lineage tree and the web runtime are new.

## License

[MIT](LICENSE).

## Author

**Ziyam Khan**, [ziyamkhan.com](https://ziyamkhan.com). ORCID [0009-0000-1943-8481](https://orcid.org/0009-0000-1943-8481).
