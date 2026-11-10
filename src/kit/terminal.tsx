'use client'
// A terminal that edits itself. TerminalWindow is the panel and its title bar; TerminalLines are prompt lines whose
// middle word can change. The typing (useRetype) and the block cursor (SmearCursor) live in smear-cursor.tsx, so a
// page can render the lines at once and load the typing later.
import type { HTMLAttributes, ReactNode, Ref } from 'react'

export type TerminalLine = {
  /** Text before the word that changes. */
  pre: string
  word: string
  /** Text after the word. */
  post?: string
  /** The longest word this line will show: the line is sized for it, so typing never reflows the block. */
  widest?: string
}

export function TerminalWindow({ title, className, children, ...rest }: { title?: ReactNode; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return <div className={['k-term', className].filter(Boolean).join(' ')} {...rest}>
    {title !== undefined && <div className="k-term-bar" aria-hidden="true">{title}</div>}
    {children}
  </div>
}

/** The lines, hidden from assistive tech: give the window a readable version of them (a list or a label). */
export function TerminalLines({ lines, active, edit, caret }: { lines: TerminalLine[]; active?: number; edit?: string; caret?: Ref<HTMLSpanElement> }) {
  return <ul className="k-term-lines" aria-hidden="true">{lines.map((l, j) => <li key={j} data-active={j === active || undefined}>
    <span className="k-term-line">
      <span className="k-term-ghost">{l.pre}{l.widest ?? l.word}{l.post}</span>
      <span>{l.pre}<span className="k-term-word">{j === active && edit !== undefined ? edit : l.word}</span>{j === active && <span ref={caret} className="k-term-caret" />}{l.post}</span>
    </span>
  </li>)}</ul>
}
