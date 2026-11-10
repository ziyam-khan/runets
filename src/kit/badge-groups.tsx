// Badge groups: a panel of labelled groups, each a wrap of badges, under a heading and a note. No hooks and no
// state, so it renders on the server and costs no JavaScript. Headings take the level you give the panel.
import type { ComponentType, ReactNode, SVGProps } from 'react'

export type BadgeGroup = { label: string; icon?: ComponentType<SVGProps<SVGSVGElement>>; items: ReactNode[] }

export function BadgeGroups({ title, note, groups, level = 3, id = 'badge-groups', className }: { title: string; note?: ReactNode; groups: BadgeGroup[]; level?: 2 | 3 | 4; id?: string; className?: string }) {
  const H = `h${level}` as 'h2', G = `h${Math.min(level + 1, 6)}` as 'h3'
  return <section className={['k-badge-groups', className].filter(Boolean).join(' ')} aria-labelledby={id}>
    <div className="k-badge-groups-head"><H id={id}>{title}</H>{note && <p>{note}</p>}</div>
    <div className="k-badge-groups-body">{groups.map(({ label, icon: Icon, items }) => <div key={label}>
      <G className="k-badge-groups-label">{Icon && <Icon className="icon" aria-hidden="true" />}{label}</G>
      <ul>{items.map((item, k) => <li key={k}><span className="k-badge">{item}</span></li>)}</ul>
    </div>)}</div>
  </section>
}
