'use client'
// A bookshelf. Books stand spine out; open one and it turns a quarter round on its spine to show its cover, while
// the shelf makes room. The turn is CSS: one registered angle, --k-turn, animates from 0 to 90 degrees, and the
// book's width (spine x cos + cover x sin) and its 3D turn are both worked out from it, so React never runs per
// frame. One book is open at a time; arrow keys move along the shelf and Escape closes the open book.
import { useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'

export type ShelfBook = {
  id: string
  title: string
  by?: string
  /** Height and spine thickness in px; the cover is 0.7 of the height wide unless you say. */
  height: number
  thickness: number
  coverWidth?: number
  color?: string
  ink?: string
  /** Replace what the spine or the cover shows. */
  spine?: ReactNode
  cover?: ReactNode
}

export function Bookshelf({ books, open: openProp, onOpenChange, label = 'Bookshelf', className }: { books: ShelfBook[]; open?: string | null; onOpenChange?: (id: string | null) => void; label?: string; className?: string }) {
  const [own, setOwn] = useState<string | null>(null)
  const open = openProp !== undefined ? openProp : own
  const set = (id: string | null) => { if (openProp === undefined) setOwn(id); onOpenChange?.(id) }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open !== null) { e.stopPropagation(); set(null); return }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const all = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.k-book-hit')], at = all.indexOf(document.activeElement as HTMLButtonElement)
    if (at < 0) return
    e.preventDefault()
    all[(at + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length].focus()
  }
  return <div className={['k-shelf', className].filter(Boolean).join(' ')} role="group" aria-label={label} onKeyDown={key}>
    {books.map(b => {
      const isOpen = open === b.id
      return <div key={b.id} className="k-book" data-open={isOpen || undefined} data-book style={{ '--k-h': `${b.height}px`, '--k-spine': `${b.thickness}px`, '--k-cover': `${b.coverWidth ?? Math.round(b.height * 0.7)}px`, ...(b.color && { '--k-book-color': b.color }), ...(b.ink && { '--k-book-ink': b.ink }) } as CSSProperties}>
        <button type="button" className="k-book-hit" aria-expanded={isOpen} aria-label={b.by ? `${b.title}, ${b.by}` : b.title} onClick={() => set(isOpen ? null : b.id)}>
          <span className="k-book-3d">
            <span className="k-book-spine">{b.spine ?? <span>{b.title}</span>}</span>
            <span className="k-book-cover" inert={!isOpen}>{b.cover ?? <><strong>{b.title}</strong>{b.by && <span>{b.by}</span>}</>}</span>
          </span>
        </button>
      </div>
    })}
  </div>
}
