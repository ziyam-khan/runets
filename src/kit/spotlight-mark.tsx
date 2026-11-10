'use client'
// A stroked mark (a monogram, a logo) lit by a light that follows the pointer across it on a spring: the stroke is a
// radial gradient from the accent to the ink, centred where the pointer is. Under reduced motion it rests.
import { useId } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import { snappy } from '../motion'

export function SpotlightMark({ d, width = 80, height = 48, stroke = 3, className }: { /** The mark's path data, drawn as a stroke. */ d: string; width?: number; height?: number; stroke?: number; className?: string }) {
  const id = useId()
  const x = useMotionValue(width * 0.375)
  const cx = useSpring(x, snappy.enter)
  const reduced = useReducedMotion()
  return <motion.svg className={['k-mark', className].filter(Boolean).join(' ')} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" onPointerMove={e => { if (!reduced) { const r = e.currentTarget.getBoundingClientRect(); x.set(((e.clientX - r.left) / r.width) * width) } }}>
    <defs><motion.radialGradient id={id} cx={cx} cy={height / 2} r={height} gradientUnits="userSpaceOnUse"><stop stopColor="var(--k-accent)" /><stop offset="1" stopColor="var(--k-ink)" /></motion.radialGradient></defs>
    <path d={d} stroke={`url(#${id})`} fill="none" strokeWidth={stroke} strokeLinejoin="round" />
  </motion.svg>
}
