'use client'
// A surface with a soft light that follows the pointer while it is over it. The position is two CSS variables,
// written straight to the element, so moving the pointer never re-renders React.
import type { HTMLAttributes } from 'react'

export function Spotlight({ className, children, onPointerMove, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={['k-spotlight', className].filter(Boolean).join(' ')} {...rest} onPointerMove={e => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--k-spot-x', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--k-spot-y', `${e.clientY - r.top}px`)
    onPointerMove?.(e)
  }}>{children}</div>
}
