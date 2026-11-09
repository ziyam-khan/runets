import type { Transition } from 'motion/react'

// Rune's motion tokens (crates/rune-motion/src/tokens.rs), exactly: a spring is (duration, bounce) with
// omega = 2 pi / duration and zeta = 1 - bounce, SwiftUI's parameterisation. Motion's own
// `visualDuration` maps the same pair about 20% slower, so the physics is written out here.
export const spring = (duration: number, bounce = 0) => {
  const omega = (2 * Math.PI) / duration
  return { type: 'spring', stiffness: omega * omega, damping: 2 * (1 - bounce) * omega, mass: 1 } satisfies Transition
}
// Exits settle sooner than entrances.
const pair = (enter: number, exit: number, bounce = 0, exitBounce = bounce) => ({ enter: spring(enter, bounce), exit: spring(exit, exitBounce), duration: enter, exitDuration: exit, bounce })

/** Pointer-tied: takes the edge off a jump without lagging the hand. */
export const instant = pair(0.1, 0.1)
/** Small controls answering a click: indicators, widths that lead, exits. */
export const snappy = pair(0.25, 0.2)
/** The default state change. Arrives and stops, no drama. */
const settle = pair(0.3, 0.24)
export { settle as default, settle }
/** Layout moving out of the way: siblings sliding into a gap, containers resizing. */
export const calm = pair(0.4, 0.32)
/** Big surfaces travelling: drawers, sheets, pages. */
export const smooth = pair(0.32, 0.26)
/** One shape becoming another: a chip opening into its panel, a menu out of its button. */
export const morph = pair(0.3, 0.27, 0.16, 0.08)
/** A release with a little life in it. Presses and confirmations only. */
export const playful = pair(0.25, 0.2, 0.15, 0.05)
/** Slow reveals and wipes the eye should follow, never utility UI. */
export const slow = pair(0.85, 0.6)
/** Explainer camera moves. */
export const camera = pair(1.2, 1.2)
/** Width leads height when a surface morphs. */
export const widthLeads = spring(0.3 * 0.78, 0.16)

/** Every token by name, for the motion palette on the components page. */
export const tokens = { instant, snap: snappy, settle, reflow: calm, glide: smooth, morph, pop: playful, drift: slow } as const

/** Kit's CSS enter and exit tweens. */
export const cssEnter = { duration: 0.15, ease: [0.2, 0.8, 0.2, 1] } satisfies Transition
export const cssExit = { duration: 0.11, ease: [0.4, 0, 1, 1] } satisfies Transition
/** The fade that replaces travel under reduced motion. */
export const reducedFade = { duration: 0.15, ease: 'easeOut' } satisfies Transition

/** Rune's blurReplace presence: in from 4 px of blur at 96% scale, out the same way, revivable mid-exit. */
export const blurReplace = {
  initial: { opacity: 0, filter: 'blur(4px)', scale: 0.96 },
  animate: { opacity: 1, filter: 'blur(0px)', scale: 1, transition: settle.enter },
  exit: { opacity: 0, filter: 'blur(4px)', scale: 0.96, transition: settle.exit },
} as const
