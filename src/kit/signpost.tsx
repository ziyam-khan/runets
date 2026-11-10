'use client'
// A signpost: wooden signs placed on a picture, each a toggle button. Boards hang centred on a pole; arrows point
// left or right from it. The chosen sign stands proud and carries its own effect, the others sheen now and then so
// they read as buttons, and a hidden sign steps aside. In a narrow container the signs leave the picture for a grid.
import type { CSSProperties, ImgHTMLAttributes, ReactNode } from 'react'

export type Sign = {
  id: string
  label: ReactNode
  count?: number
  /** A framed board centred on the pole, or an arrow pointing left or right from it. */
  shape: 'board' | 'left' | 'right'
  /** Where it sits, in percent of the picture: the pole's x for boards and for the arrows' base, and its centre's y. */
  at: [x: number, y: number]
  /** Drawn while this sign is the chosen one (a glow, sparkles, a charge). */
  effect?: ReactNode
  hidden?: boolean
}
export type SignpostProps = {
  image: ImgHTMLAttributes<HTMLImageElement>
  signs: Sign[]
  value: string
  onValueChange: (id: string) => void
  /** The pole that carries the boards, in percent: x, top and bottom. */
  pole?: [x: number, top: number, bottom: number]
  /** Sheen the unchosen signs now and then. Turn it off when the visitor has switched motion off. */
  idle?: boolean
  label: string
  className?: string
}

export function Signpost({ image, signs, value, onValueChange, pole, idle = true, label, className }: SignpostProps) {
  const { alt = '', ...img } = image
  return <div className={['k-signpost', className].filter(Boolean).join(' ')} data-idle={idle || undefined}>
    <img alt={alt} {...img} />
    <nav className="k-signs" aria-label={label}>
      {pole && <span className="k-pole" aria-hidden="true" style={{ '--x': `${pole[0]}%`, '--top': `${pole[1]}%`, '--bottom': `${pole[2]}%` } as CSSProperties} />}
      {signs.map((s, k) => { const chosen = value === s.id; return <button key={s.id} type="button" className="k-sign" data-id={s.id} data-shape={s.shape} data-hidden={s.hidden || undefined} aria-pressed={chosen} tabIndex={s.hidden ? -1 : undefined} aria-hidden={s.hidden || undefined}
        style={{ '--x': `${s.at[0]}%`, '--y': `${s.at[1]}%`, '--delay': `${k * 1.2}s` } as CSSProperties} onClick={() => onValueChange(s.id)}>
        {chosen && s.effect}<span>{s.label}</span>{s.count !== undefined && <span className="k-sign-count">{s.count}</span>}
      </button> })}
    </nav>
  </div>
}
