'use client'
// A brand menu: right-click (or long-press) a logo and, instead of the browser's menu, a dialog offers the brand's
// own actions: copy the name, download the mark. A plain click still follows the logo's link.
import { useRef, type ReactElement } from 'react'

export type BrandAction = { label: string; onSelect?: () => void; href?: string; download?: string }

export function BrandMenu({ title, actions, children }: { title: string; actions: BrandAction[]; children: ReactElement }) {
  const dialog = useRef<HTMLDialogElement>(null)
  return <div className="k-brand" onContextMenu={e => { e.preventDefault(); dialog.current?.showModal() }}>
    {children}
    <dialog ref={dialog} className="k-brand-dialog" aria-label={`${title}: brand assets`} onClick={e => { if (e.target === dialog.current) dialog.current?.close() }}>
      <h2>{title}</h2>
      <div className="k-brand-actions">
        {actions.map(a => a.href ? <a key={a.label} className="k-btn" data-variant="outline" data-size="normal" href={a.href} download={a.download}>{a.label}</a> : <button key={a.label} type="button" className="k-btn" data-variant="outline" data-size="normal" onClick={a.onSelect}>{a.label}</button>)}
        <button type="button" className="k-btn" data-variant="ghost" data-size="normal" onClick={() => dialog.current?.close()}>Close</button>
      </div>
    </dialog>
  </div>
}
