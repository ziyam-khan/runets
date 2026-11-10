'use client'
// A lineage drawn as a tree: each node sits one tier below the deepest node it builds on, and elbow
// connectors (down, along a shared bus, down) join a parent to its children. One node can be the focal one.
// The connectors are measured from the laid-out nodes, so the nodes stay ordinary links and text.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type LineageNode = {
  id: string
  title: string
  /** A small label above the title: a category or a line of work. */
  tag?: string
  /** Technical detail under the title, set in mono. */
  sub?: ReactNode
  href?: string
  /** Ids of the nodes this one builds on. */
  parents?: string[]
  focal?: boolean
}
export type LineageTreeProps = {
  nodes: LineageNode[]
  label: string
  /** A name for each tier, top down. */
  tiers?: string[]
  legend?: [kind: 'focal' | 'branch' | 'leaf', text: string][]
  caption?: ReactNode
  className?: string
}

/** Tiers by longest path from a root; within a tier, children follow their first parent's order. */
export function lineageTiers(nodes: LineageNode[]) {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const depth = new Map<string, number>()
  const of = (n: LineageNode, seen: Set<string>): number => {
    if (depth.has(n.id)) return depth.get(n.id)!
    if (seen.has(n.id)) throw new Error(`lineage cycle at ${n.id}`)
    seen.add(n.id)
    const ps = (n.parents ?? []).map(id => byId.get(id)).filter((p): p is LineageNode => !!p)
    const d = ps.length ? 1 + Math.max(...ps.map(p => of(p, seen))) : 0
    depth.set(n.id, d)
    return d
  }
  for (const n of nodes) of(n, new Set())
  const tiers: LineageNode[][] = []
  for (const n of nodes) (tiers[depth.get(n.id)!] ??= []).push(n)
  const order = new Map<string, number>()
  return tiers.map(tier => {
    const sorted = [...tier].sort((a, b) => (order.get(a.parents?.find(id => order.has(id)) ?? '') ?? -1) - (order.get(b.parents?.find(id => order.has(id)) ?? '') ?? -1))
    sorted.forEach((n, i) => order.set(n.id, i))
    return sorted
  })
}

export function LineageTree({ nodes, label, tiers: names = [], legend, caption, className }: LineageTreeProps) {
  const tiers = lineageTiers(nodes)
  const host = useRef<HTMLDivElement>(null)
  const [paths, setPaths] = useState<string[]>([])
  const [shown, setShown] = useState(false)
  const hasChildren = new Set(nodes.flatMap(n => n.parents ?? []))
  const titleOf = new Map(nodes.map(n => [n.id, n.title]))

  useLayoutEffect(() => {
    const el = host.current!
    // Layout offsets, not client rects, so the wires stay right inside a transformed or zoomed parent.
    const measure = () => {
      const at = (id: string) => el.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)
      const next: string[] = []
      for (const n of nodes) for (const pid of n.parents ?? []) {
        const p = at(pid), c = at(n.id)
        if (!p || !c) continue
        const x1 = Math.round(p.offsetLeft + p.offsetWidth / 2), y1 = p.offsetTop + p.offsetHeight
        const x2 = Math.round(c.offsetLeft + c.offsetWidth / 2), y2 = c.offsetTop
        const bus = Math.round((y1 + y2) / 2)
        next.push(`M${x1} ${y1}V${bus}H${x2}V${y2}`)
      }
      setPaths(next)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect() } }, { threshold: 0.3 })
    io.observe(el)
    return () => { ro.disconnect(); io.disconnect() }
  }, [nodes])

  return <figure className={className ? `k-lineage ${className}` : 'k-lineage'} aria-label={label} data-shown={shown || undefined} data-named={names.length > 0 || undefined}>
    <div ref={host} className="k-lineage-body">
      <svg className="k-lineage-wires" aria-hidden="true">{paths.map(d => <path key={d} d={d} pathLength={1} />)}</svg>
      {tiers.map((tier, t) => <div key={t} className="k-lineage-tier" style={{ '--tier': t } as React.CSSProperties}>
        {names[t] && <p className="k-lineage-tier-name">{names[t]}</p>}
        <ol className="k-lineage-row">{tier.map(n => {
          const kind = n.focal ? 'focal' : hasChildren.has(n.id) ? 'branch' : 'leaf'
          const body = <>{n.tag && <span className="k-lineage-tag">{n.tag}</span>}<strong className="k-lineage-title">{n.title}</strong>{n.sub && <span className="k-lineage-sub">{n.sub}</span>}{n.parents?.length ? <span className="k-sr">Builds on {n.parents.map(id => titleOf.get(id)).filter(Boolean).join(' and ')}.</span> : null}</>
          return <li key={n.id} data-node={n.id} data-kind={kind} className="k-lineage-node">{n.href ? <a href={n.href}>{body}</a> : <div>{body}</div>}</li>
        })}</ol>
      </div>)}
    </div>
    {(legend || caption) && <figcaption className="k-lineage-foot">
      {legend && <ul className="k-lineage-legend">{legend.map(([kind, text]) => <li key={kind}><i data-kind={kind} aria-hidden="true" />{text}</li>)}</ul>}
      {caption && <p className="k-lineage-caption">{caption}</p>}
    </figcaption>}
  </figure>
}
