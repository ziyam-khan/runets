'use client'
// A scroll box whose edges fade where there is more to scroll, and only there: at the top the top edge is crisp, at
// the end the bottom one is. The state is two data attributes set on scroll, so the fade itself is plain CSS.
import { useEffect, useRef, type HTMLAttributes } from 'react'

export function ScrollFade({ horizontal, className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { horizontal?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current!
    const update = () => {
      const [pos, size, view] = horizontal ? [el.scrollLeft, el.scrollWidth, el.clientWidth] : [el.scrollTop, el.scrollHeight, el.clientHeight]
      el.toggleAttribute('data-more-before', pos > 1)
      el.toggleAttribute('data-more-after', pos + view < size - 1)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update); ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [horizontal])
  return <div ref={box} className={['k-scroll-fade', className].filter(Boolean).join(' ')} data-axis={horizontal ? 'x' : 'y'} {...rest}>{children}</div>
}
