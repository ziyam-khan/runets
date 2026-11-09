'use client'
// Surfaces and data from rune-kit (MIT, Anomaly): card, list, accordion, collapsible, the app shell, a file
// tree and a table. Keyboard behaviour follows the originals: one Tab stop, a cursor the arrow keys move.
import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { ChevronRight, ChevronUp, ChevronDown, File, Folder, PanelLeft } from 'lucide-react'
import { Accordion as BaseAccordion } from '@base-ui/react/accordion'
import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible'
import { calm, smooth, snappy } from '../motion'
import { IconButton } from './controls'

export function Card({ tone = 'neutral', title, children }: { tone?: 'neutral' | 'info' | 'warning' | 'error'; title: string; children: ReactNode }) {
  return <div className="k-card" data-tone={tone} role={tone === 'error' || tone === 'warning' ? 'alert' : undefined}><h4>{title}</h4><p>{children}</p></div>
}

/** Rows with a selection that springs between them; Up, Down, Home and End move it. */
export function List({ rows, label }: { rows: { id: string; title: string; detail?: string; icon?: ReactNode }[]; label: string }) {
  const [sel, setSel] = useState(rows[0]?.id)
  const id = useId()
  const move = (e: React.KeyboardEvent) => {
    const k = rows.findIndex(r => r.id === sel)
    const n = e.key === 'ArrowDown' ? k + 1 : e.key === 'ArrowUp' ? k - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : null
    if (n === null) return
    e.preventDefault(); setSel(rows[Math.max(0, Math.min(rows.length - 1, n))].id)
  }
  return <LayoutGroup id={id}><div className="k-list" role="listbox" aria-label={label} tabIndex={0} aria-activedescendant={`${id}-${sel}`} onKeyDown={move}>
    {rows.map(r => <div key={r.id} id={`${id}-${r.id}`} role="option" aria-selected={r.id === sel} className="k-list-row" onClick={() => setSel(r.id)}>
      {r.id === sel && <motion.span layoutId="sel" className="k-list-sel" transition={snappy.enter} />}
      <span aria-hidden="true">{r.icon}</span><span>{r.title}</span><small>{r.detail}</small>
    </div>)}
  </div></LayoutGroup>
}

export function Accordion({ items }: { items: { title: string; body: ReactNode }[] }) {
  return <BaseAccordion.Root className="k-acc">{items.map(it => <BaseAccordion.Item key={it.title} className="k-acc-item">
    <BaseAccordion.Header render={<h4 style={{ margin: 0 }} />}><BaseAccordion.Trigger className="k-acc-trigger">{it.title}<ChevronRight size={15} /></BaseAccordion.Trigger></BaseAccordion.Header>
    <BaseAccordion.Panel className="k-acc-panel"><div>{it.body}</div></BaseAccordion.Panel>
  </BaseAccordion.Item>)}</BaseAccordion.Root>
}
export function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  return <BaseCollapsible.Root className="k-acc"><BaseCollapsible.Trigger className="k-acc-trigger">{title}<ChevronRight size={15} /></BaseCollapsible.Trigger><BaseCollapsible.Panel className="k-acc-panel"><div>{children}</div></BaseCollapsible.Panel></BaseCollapsible.Root>
}

/**
 * The shell: a sidebar that resizes by its edge (double-click resets it, dragging below half the minimum
 * collapses it), opens and closes on the glide spring, and peeks back over the content when the pointer
 * rests on the leading edge.
 */
export function Shell({ sidebar, children, title }: { sidebar: ReactNode; children: ReactNode; title: string }) {
  const [open, setOpen] = useState(true)
  const [width, setWidth] = useState(200)
  const [peek, setPeek] = useState(false)
  const reduced = useReducedMotion()
  const drag = useRef<{ x: number; w: number } | null>(null)
  const MIN = 140, MAX = 280, REST = 200
  const shown = open || peek
  return <div className="k-shell" onPointerLeave={() => setPeek(false)}>
    <motion.aside className="k-shell-side" aria-label="Sidebar" animate={{ width: shown ? width : 0, opacity: shown ? 1 : 0 }} transition={reduced ? { duration: 0 } : smooth.enter} style={peek && !open ? { position: 'absolute', zIndex: 2, height: '100%', boxShadow: 'var(--k-shadow-pop)' } : undefined}>
      <div className="k-shell-side-inner" style={{ width }}>{sidebar}</div>
    </motion.aside>
    <div className="k-shell-main">
      {open && <div className="k-shell-grip" role="separator" aria-orientation="vertical" aria-valuenow={width} aria-valuemin={MIN} aria-valuemax={MAX} aria-label="Sidebar width" tabIndex={0}
        onKeyDown={e => { if (e.key === 'ArrowLeft') setWidth(w => Math.max(MIN, w - 10)); if (e.key === 'ArrowRight') setWidth(w => Math.min(MAX, w + 10)) }}
        onDoubleClick={() => setWidth(REST)}
        onPointerDown={e => { drag.current = { x: e.clientX, w: width }; (e.target as HTMLElement).setPointerCapture(e.pointerId) }}
        onPointerMove={e => { if (!drag.current) return; const w = drag.current.w + e.clientX - drag.current.x; if (w < MIN / 2) { setOpen(false); drag.current = null } else setWidth(Math.max(MIN, Math.min(MAX, Math.round(w)))) }}
        onPointerUp={() => { drag.current = null }} />}
      {!open && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 16 }} onPointerEnter={() => setPeek(true)} />}
      <div className="k-shell-bar"><IconButton label={open ? 'Hide sidebar' : 'Show sidebar'} variant="ghost" size="small" onClick={() => { setOpen(o => !o); setPeek(false) }} aria-expanded={open}><PanelLeft /></IconButton><strong style={{ fontSize: 'var(--text-sm)' }}>{title}</strong></div>
      {children}
    </div>
  </div>
}

// ---------------------------------------------------------------- tree
type Node = { id: string; name: string; dir: boolean; children: Node[] }
const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
/** Paths into a tree: folders before files, natural order, a chain of single-child folders as one row. */
export function fileTree(paths: string[]): Node[] {
  const root: Node = { id: '', name: '', dir: true, children: [] }
  for (const path of paths) {
    let at = root
    path.split('/').forEach((part, k, all) => {
      const id = all.slice(0, k + 1).join('/')
      let next = at.children.find(c => c.name === part)
      if (!next) { next = { id, name: part, dir: k < all.length - 1, children: [] }; at.children.push(next) }
      at = next
    })
  }
  const tidy = (n: Node): Node => {
    let node = n
    while (node.dir && node.children.length === 1 && node.children[0].dir) { const c = node.children[0]; node = { ...c, name: `${node.name}/${c.name}` } }
    return { ...node, children: node.children.map(tidy).sort((a, b) => (a.dir === b.dir ? natural.compare(a.name, b.name) : a.dir ? -1 : 1)) }
  }
  return tidy(root).children
}
export function Tree({ nodes, label }: { nodes: Node[]; label: string }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(nodes.filter(n => n.dir).slice(0, 1).map(n => n.id)))
  const [cur, setCur] = useState(nodes[0]?.id)
  const typed = useRef({ text: '', at: 0 })
  const rows = useMemo(() => { const out: { n: Node; depth: number; parent?: string }[] = []; const walk = (list: Node[], depth: number, parent?: string) => list.forEach(n => { out.push({ n, depth, parent }); if (n.dir && open.has(n.id)) walk(n.children, depth + 1, n.id) }); walk(nodes, 0); return out }, [nodes, open])
  const k = Math.max(0, rows.findIndex(r => r.n.id === cur))
  const toggle = (id: string, to?: boolean) => setOpen(s => { const t = new Set(s); if (to ?? !t.has(id)) t.add(id); else t.delete(id); return t })
  const key = (e: React.KeyboardEvent) => {
    const r = rows[k]
    const go = (i: number) => { e.preventDefault(); setCur(rows[Math.max(0, Math.min(rows.length - 1, i))].n.id) }
    if (e.key === 'ArrowDown') go(k + 1)
    else if (e.key === 'ArrowUp') go(k - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(rows.length - 1)
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (r.n.dir) { if (open.has(r.n.id)) go(k + 1); else toggle(r.n.id, true) } }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (r.n.dir && open.has(r.n.id)) toggle(r.n.id, false); else if (r.parent) setCur(r.parent) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (r.n.dir) toggle(r.n.id) }
    else if (e.key.length === 1) {
      const now = performance.now(); typed.current.text = now - typed.current.at < 700 ? typed.current.text + e.key.toLowerCase() : e.key.toLowerCase(); typed.current.at = now
      const hit = rows.findIndex((x, i) => i > k - 1 && x.n.name.toLowerCase().startsWith(typed.current.text)) ; if (hit >= 0) setCur(rows[hit].n.id)
    }
  }
  return <div className="k-tree" role="tree" aria-label={label} tabIndex={0} aria-activedescendant={`t-${cur}`} onKeyDown={key}>
    {rows.map(({ n, depth }) => <div key={n.id} id={`t-${n.id}`} role="treeitem" aria-level={depth + 1} aria-selected={n.id === cur} aria-expanded={n.dir ? open.has(n.id) : undefined} className="k-tree-row" onClick={() => { setCur(n.id); if (n.dir) toggle(n.id) }}>
      {Array.from({ length: depth }, (_, i) => <span key={i} className="k-tree-guide" aria-hidden="true" />)}
      <span className="k-tree-chev" aria-hidden="true">{n.dir && <ChevronRight size={13} />}</span>
      {n.dir ? <Folder size={14} aria-hidden="true" /> : <File size={14} aria-hidden="true" />}<span>{n.name}</span>
    </div>)}
  </div>
}

// ---------------------------------------------------------------- table
export type Column<T> = { id: keyof T & string; title: string; align?: 'start' | 'end'; format?: (v: T[keyof T]) => string }
/** Sortable columns, a cursor row the arrow keys move, zebra stripes, figures at one width. */
export function Table<T extends Record<string, string | number>>({ columns, rows, label }: { columns: Column<T>[]; rows: T[]; label: string }) {
  const [sort, setSort] = useState<{ id: keyof T; dir: 1 | -1 }>({ id: columns[0].id, dir: 1 })
  const [cur, setCur] = useState(0)
  const sorted = useMemo(() => [...rows].sort((a, b) => { const x = a[sort.id], y = b[sort.id]; return (typeof x === 'number' && typeof y === 'number' ? x - y : natural.compare(String(x), String(y))) * sort.dir }), [rows, sort])
  return <div className="k-table-wrap" tabIndex={0} role="group" aria-label={label} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setCur(c => Math.min(rows.length - 1, c + 1)) } if (e.key === 'ArrowUp') { e.preventDefault(); setCur(c => Math.max(0, c - 1)) } }}>
    <table className="k-table" data-zebra>
      <thead><tr>{columns.map(c => <th key={c.id} data-align={c.align} aria-sort={sort.id === c.id ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}><button type="button" onClick={() => setSort(s => ({ id: c.id, dir: s.id === c.id ? (s.dir === 1 ? -1 : 1) : 1 }))}>{c.title}{sort.id === c.id && (sort.dir === 1 ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}</button></th>)}</tr></thead>
      <tbody>{sorted.map((r, i) => <motion.tr key={String(r[columns[0].id])} layout="position" transition={calm.enter} aria-selected={i === cur} onClick={() => setCur(i)}>{columns.map(c => <td key={c.id} data-align={c.align}>{c.format ? c.format(r[c.id]) : String(r[c.id])}</td>)}</motion.tr>)}</tbody>
    </table>
  </div>
}
