'use client'
// The readout for ContributionGraph: one tip that names the day under the pointer, or, once the grid has keyboard
// focus, the day the arrow keys are on (left and right move a week, up and down a day). It is a polite live
// region, so a screen reader hears each day as the keys move.
import { useEffect, useRef } from 'react'

const keys: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 }

export function ContributionTip({ label = 'contribution' }: { label?: string }) {
  const tip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = tip.current!, fig = el.parentElement!, box = fig.querySelector<HTMLElement>('.k-cg-scroll')!
    const cells = [...box.querySelectorAll('rect[data-d]')]
    let on = -1
    const show = (k: number) => {
      cells[on]?.removeAttribute('data-on')
      on = k
      const cell = cells[k]
      el.toggleAttribute('data-open', !!cell)
      if (!cell) { el.textContent = ''; return }
      cell.setAttribute('data-on', '')
      const n = Number(cell.getAttribute('data-n')), date = new Date(`${cell.getAttribute('data-d')}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      el.textContent = `${n ? n.toLocaleString('en-GB') : 'No'} ${label}${n === 1 ? '' : 's'} on ${date}`
      const r = cell.getBoundingClientRect(), f = fig.getBoundingClientRect(), half = el.offsetWidth / 2
      el.style.left = `${Math.min(Math.max(r.left + r.width / 2 - f.left, half), f.width - half)}px`
      el.style.top = `${r.top - f.top}px`
    }
    const over = (e: PointerEvent) => { const k = cells.indexOf(e.target as Element); if (k >= 0) show(k) }
    const leave = () => { if (document.activeElement !== box) show(-1) }
    const focus = () => { if (box.matches(':focus-visible')) show(on < 0 ? cells.length - 1 : on) }
    const blur = () => show(-1)
    const key = (e: KeyboardEvent) => {
      const from = on < 0 ? cells.length - 1 : on
      const k = e.key === 'Home' ? 0 : e.key === 'End' ? cells.length - 1 : keys[e.key] ? Math.min(Math.max(from + keys[e.key], 0), cells.length - 1) : -1
      if (k < 0) return
      e.preventDefault()
      cells[k].scrollIntoView({ block: 'nearest', inline: 'nearest' })
      show(k)
    }
    box.addEventListener('pointerover', over); box.addEventListener('pointerleave', leave)
    box.addEventListener('focus', focus); box.addEventListener('blur', blur); box.addEventListener('keydown', key)
    return () => {
      box.removeEventListener('pointerover', over); box.removeEventListener('pointerleave', leave)
      box.removeEventListener('focus', focus); box.removeEventListener('blur', blur); box.removeEventListener('keydown', key)
    }
  }, [label])
  return <div ref={tip} className="k-cg-tip" role="status" />
}
