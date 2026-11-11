// Contribution graph: a year of daily counts as a grid of squares, a column per week with Sunday on top, busier days
// in stronger accent. The grid is an SVG with no hooks, so it renders on the server; ContributionTip, the only
// client code, reads out the day under the pointer or under the arrow keys.
import type { ReactNode } from 'react'
import { ContributionTip } from './contribution-tip'

export type ContributionDay = { date: string; count: number }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const STEP = 14, CELL = 11, LEFT = 28, TOP = 16

/** Level 0 to 4: none, then quarters of the busiest day. */
export const levelOf = (count: number, max: number) => count && Math.ceil(4 * count / max)

export function ContributionGraph({ days, title, note, href, label = 'contribution', period = 'in the last year', level = 3, id = 'contributions', className }: {
  /** One entry per day, oldest first, dates as YYYY-MM-DD. */
  days: ContributionDay[]; title?: string; note?: ReactNode
  /** Links the total, to the profile the counts come from. */
  href?: string
  /** What a count counts; made plural on its own. */
  label?: string; period?: string; level?: 2 | 3 | 4; id?: string; className?: string
}) {
  if (!days.length) return null
  const H = `h${level}` as 'h3', total = days.reduce((sum, day) => sum + day.count, 0), max = Math.max(1, ...days.map(day => day.count))
  const lead = new Date(`${days[0].date}T00:00:00Z`).getUTCDay(), weeks = Math.ceil((lead + days.length) / 7)
  const col = (i: number) => Math.floor((lead + i) / 7)
  // A month is named over the week its first day falls in, when there is room for three letters before the next.
  const months = days.flatMap((day, i) => i === 0 || day.date.endsWith('-01') ? [{ at: col(i), name: MONTHS[Number(day.date.slice(5, 7)) - 1] }] : [])
    .filter((m, k, all) => (all[k + 1]?.at ?? weeks + 1) - m.at >= 3)
  const W = LEFT + weeks * STEP - STEP + CELL, Ht = TOP + 7 * STEP - STEP + CELL
  const sum = `${total.toLocaleString('en-GB')} ${label}${total === 1 ? '' : 's'}`
  return <section className={['k-cg', className].filter(Boolean).join(' ')} aria-labelledby={title ? id : undefined}>
    {title && <div className="k-cg-head"><H id={id}>{title}</H>{note && <p>{note}</p>}</div>}
    <figure>
      <div className="k-cg-scroll" tabIndex={0} role="group" aria-label={`${sum} ${period}. Arrow keys read each day.`}>
        <svg viewBox={`-1 0 ${W + 2} ${Ht + 1}`} style={{ minWidth: W + 2 }} aria-hidden="true">{/* a unit of margin, so the ring on an edge day is not clipped */}
          {months.map(m => <text key={m.at} x={LEFT + m.at * STEP} y={TOP - 6}>{m.name}</text>)}
          {['Mon', 'Wed', 'Fri'].map((d, k) => <text key={d} x={LEFT - 6} y={TOP + (2 * k + 1) * STEP + CELL - 2} textAnchor="end">{d}</text>)}
          {days.map((day, i) => <rect key={day.date} x={LEFT + col(i) * STEP} y={TOP + ((lead + i) % 7) * STEP} width={CELL} height={CELL} rx={2} data-d={day.date} data-n={day.count} data-l={levelOf(day.count, max)} />)}
        </svg>
      </div>
      <ContributionTip label={label} />
      <figcaption className="k-cg-foot">
        <span>{href ? <a href={href}>{sum}</a> : sum} {period}</span>
        <span className="k-cg-legend" aria-hidden="true">Less{[0, 1, 2, 3, 4].map(l => <i key={l} data-l={l} />)}More</span>
      </figcaption>
    </figure>
  </section>
}
