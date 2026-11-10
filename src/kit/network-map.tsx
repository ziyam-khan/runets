// A network map: a hub joined to its nodes. A node that is done (a page visited, a step finished) is filled and its
// link drawn solid; the rest are hollow and dashed, like clients missing from a round. Labelled, each node is a link.
export type MapNode = { id: string; label: string; href?: string; at: [x: number, y: number]; done?: boolean; /** Where its label sits. */ labelAt?: [x: number, y: number, anchor: 'start' | 'middle' | 'end'] }

export function NetworkMap({ hub, nodes, labelled, viewBox, label = 'Map', className }: { hub: MapNode; nodes: MapNode[]; labelled?: boolean; viewBox: string; label?: string; className?: string }) {
  const dot = (n: MapNode, r: number) => {
    const body = <g className="k-map-node" data-done={n.done || undefined}><circle cx={n.at[0]} cy={n.at[1]} r={r} />{labelled && n.labelAt && <text x={n.labelAt[0]} y={n.labelAt[1]} textAnchor={n.labelAt[2]}>{n.label}</text>}</g>
    return labelled && n.href ? <a key={n.id} href={n.href} aria-label={`${n.label}, ${n.done ? 'visited' : 'not visited yet'}`}>{body}</a> : <g key={n.id}>{body}</g>
  }
  return <svg className={['k-map', className].filter(Boolean).join(' ')} viewBox={viewBox} aria-hidden={labelled ? undefined : true} role={labelled ? 'group' : undefined} aria-label={labelled ? label : undefined} focusable="false">
    {nodes.map(n => <line key={n.id} className="k-map-link" data-done={n.done || undefined} x1={hub.at[0]} y1={hub.at[1]} x2={n.at[0]} y2={n.at[1]} />)}
    {dot(hub, 8)}{nodes.map(n => dot(n, 6))}
  </svg>
}
