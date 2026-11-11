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

runets is my library of components, springs and WebGL 2 shader effects for React, in TypeScript. Every effect runs on one WebGL 2 engine with one clock, so a page of fifty live effects stays smooth, and it settles on still frames where there is no GPU.

- shader effects in GLSL for WebGL 2: glow, pulse, electricity, fire, glass, liquid metal, dither and more;
- weather (rain, snow, shooting stars, sandstorm, petal wind) and a light layer;
- a component kit on accessible [Base UI](https://base-ui.com) primitives, with a lineage tree;
- components a portfolio is made of: a retyping terminal with a smear cursor, a signpost, a bookshelf, a timeline, heat cards, an outline, a marquee and small toys;
- spring tokens with exact physics.

The live gallery, with a page per component and knobs for every parameter, is [My Components](https://ziyamkhan.com/my-components/) on ziyamkhan.com. That site is built with runets. For coding agents, [ziyamkhan.com/my-components/llms.txt](https://ziyamkhan.com/my-components/llms.txt) has every component's import, usage, props and files in plain text.

## What's inside

| Group | Contents |
|---|---|
| Motion | `instant`, `snap`, `settle`, `reflow`, `glide`, `morph`, `pop` and `drift` springs, as enter and exit pairs (duration and bounce, SwiftUI's parameterisation: ω = 2π / duration, ζ = 1 − bounce). Also `blurReplace` presence, `RollingText` and `MotionBlur` |
| Effects | Glow (soft, neon that cools, aura, mask), Pulse (radar, breathe, heartbeat, ping, ripple), Electricity (arc, border, charged), Fire (flames with embers, plasma, heat), Heat haze, Shockwave, Liquid glass, CRT, Chromatic split, Shimmer, Sparkles, Aurora, Grain |
| Fills | Liquid metal, Mesh gradient, Dither (Bayer, blue noise, white), Grain gradient, Fluted glass, Metaballs, Swirl, Voronoi, Waves, Halftone, Plastic, each with presets |
| Weather | Rain (streaks, splashes, drops on the glass refracting the scene), Snow (four depths, bokeh, frost), Shooting stars, Sandstorm. `PetalWind`: sakura petals on a 2D canvas (no GPU), stirred by the pointer |
| Light | A lamp above the page: soft shadows from raised elements, rim light on their bevels |
| Kit | Button (ten variants, three sizes, five states), IconButton, Switch, Checkbox, RadioGroup, SegmentedControl, Badge, Keybind, Spinner, Loader, Progress, ProgressCircle, TextField, Select, Combobox, ShortcutRecorder, Menu, Popover, Tooltip, HoverCard, Dialog, Toast, Card, List, Accordion, Collapsible, Shell, Tree, Table, LineageTree (which work builds on which, with elbow wires), ContributionGraph (a year of daily counts as squares, drawn on the server, with a tip that reads each day by pointer or arrow keys) |
| Text | `TerminalWindow` and `TerminalLines` (prompt lines that retype one word), `useRetype`, `SmearCursor` (a block cursor that smears from cell to cell), `WordSwap` (words taking turns in one place, in CSS), `Marquee` |
| Navigation | `Signpost` (wooden signs on a picture, each a toggle), `Outline` (where you are in an article), `ScrollFade`, `NetworkMap` (a site map of visited pages) |
| Content | `Bookshelf` (a book turns on its spine to show its cover, in CSS), `Timeline` (work and education), `HeatCard` (a card that warms while you look at it), `BadgeGroups`, `Testimonial`, `Spotlight`, `ArticleList`, `CopyButton`, `ShareMenu`, `BrandMenu`, `SpotlightMark`, `FilterKeys` with `ResultCount` |
| Play | `ElasticSlider`, `SlideToUnlock`, `BrickBreaker` (a canvas game coloured by the theme), `useTap` (a click synthesised with WebAudio, no sound file) |

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

Every effect is data in `src/fx/effects.ts`: its defaults, its presets, a knob per parameter (range, step, kind) and `pack`, which writes a layer into the shader's slots. A tuning panel, a props table and a code generator can all be built from that one definition, and the gallery's are.

## How the effects run

- **One engine, one clock.** Small canvases share one WebGL 2 context: each draws there, then is copied, so a page of fifty live effects never runs out of contexts. A full-screen canvas can own its context. One clock drives every layer. It can be pinned (`window.runetsClock.pin(t)`) for screenshots and tests.
- **Deterministic.** Each frame is a pure function of pixel, time and seed. The hashes are integer PCG on the GPU and in TypeScript alike, so CPU tables and shaders agree.
- **Quiet when nothing changes.** A canvas off screen, a hidden tab, a settled one-shot or a heated glow at rest draws nothing. Under `prefers-reduced-motion`, every loop settles on one calm pose and one-shots fade in place.
- **A pause switch.** `data-motion="off"` on the root element rests every layer on its calm pose and stops the kit's CSS loops (marquee, cursor blink, sheens) until it is removed, so a site's own pause button only has to set it.
- **Still without a GPU.** When WebGL runs on the CPU (SwiftShader, llvmpipe, Microsoft Basic Render Driver), every effect draws that same calm pose once and stops, and the root gets `data-gpu="none"` so your CSS can drop its blurs too. Only those renderer names count, so a real GPU, however old, keeps the motion.
- **Made for a page.**
  - The backdrop that glass and distortion read is an image or a painted canvas you hand the layer: a page cannot sample the frame behind an element. Its mip chain stands in for a blur pyramid.
  - Light beyond coverage becomes coverage of its own hue, because a canvas cannot add light. Over dark UI this matches an additive blend.
  - Fire is noise flames, plasma and embers, with no fluid simulation. Motion blur is directional, from measured velocity.

## Status

0.1, early. It is extracted from the site it was built for, where every effect and component is in use. The API may still move.

## Credits

runets is inspired by [Rune](https://github.com/anomalyco/rune) by Anomaly (MIT). Many of its shader effects and presets, the kit's names and states and the motion tokens are adapted from Rune, so Rune's copyright notice is kept in [LICENSE](LICENSE), as the license requires. The weather effects, petal wind, the lineage tree, the light layer, the web runtime and every component in the Text, Navigation, Content and Play rows are runets' own.

## License

[MIT](LICENSE).

## Author

**Ziyam Khan**, [ziyamkhan.com](https://ziyamkhan.com). ORCID [0009-0000-1943-8481](https://orcid.org/0009-0000-1943-8481).
