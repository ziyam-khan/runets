// A timeline of work and study: groups (work, education) each under its own heading and accent, and in each a row
// per role: where on the left, what and when on the right. No state: it renders on the server.
import type { ComponentType, CSSProperties, ReactNode, SVGProps } from 'react'

export type TimelineEntry = { id: string; org: string; title: string; start: string; end?: string; badge?: string; description?: ReactNode }
export type TimelineGroup = { id: string; title: string; icon?: ComponentType<SVGProps<SVGSVGElement>>; /** Any CSS colour; the accent by default. */ tone?: string; entries: TimelineEntry[] }

export function Timeline({ groups, level = 3, present = 'present' }: { groups: TimelineGroup[]; level?: 2 | 3 | 4; present?: string }) {
  const H = `h${level}` as 'h3', E = `h${Math.min(level + 1, 6)}` as 'h4'
  return <div className="k-timeline">{groups.map(({ id, title, icon: Icon, tone, entries }) => <section key={id} className="k-timeline-group" data-group={id} style={tone ? { '--k-tl': tone } as CSSProperties : undefined} aria-labelledby={`tl-${id}`}>
    <H id={`tl-${id}`} className="k-timeline-head">{Icon && <Icon className="icon" aria-hidden="true" />}{title}</H>
    <ol>{entries.map(e => <li key={e.id} className="k-timeline-entry">
      <div><E>{e.org}</E>{e.badge && <span className="k-badge">{e.badge}</span>}</div>
      <div><E>{e.title}</E><p className="k-timeline-when"><time>{e.start}</time> to <time>{e.end ?? present}</time></p>{e.description && <p>{e.description}</p>}</div>
    </li>)}</ol>
  </section>)}</div>
}
