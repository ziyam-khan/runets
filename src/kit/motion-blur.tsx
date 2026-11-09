'use client'
// Motion blur for the web: the element blurs along its direction of travel, by its measured velocity,
// and is sharp at rest. (A page cannot render a node at sub-frame poses, so this is the directional mode.)
import { useId, useRef, type ReactNode } from 'react'
import { motion, useMotionValue, useMotionValueEvent, useVelocity, type MotionProps } from 'motion/react'

/** A draggable, flingable element whose blur follows its speed: `px/s / perPx`, capped at `max` px. */
export function MotionBlur({ children, className, perPx = 140, max = 18, ...rest }: { children: ReactNode; className?: string; perPx?: number; max?: number } & MotionProps) {
  const id = useId().replace(/:/g, '')
  const x = useMotionValue(0), y = useMotionValue(0)
  const vx = useVelocity(x), vy = useVelocity(y)
  const blur = useRef<SVGFEGaussianBlurElement>(null)
  const update = () => blur.current?.setAttribute('stdDeviation', `${Math.min(max, Math.abs(vx.get()) / perPx).toFixed(2)} ${Math.min(max, Math.abs(vy.get()) / perPx).toFixed(2)}`)
  useMotionValueEvent(vx, 'change', update)
  useMotionValueEvent(vy, 'change', update)
  return <>
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}><filter id={`blur-${id}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur ref={blur} stdDeviation="0 0" /></filter></svg>
    <motion.div className={className} style={{ x, y, filter: `url(#blur-${id})` }} {...rest}>{children}</motion.div>
  </>
}
