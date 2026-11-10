'use client'
// A share menu: a button that opens a small panel to copy the link, share it through the device's own share sheet
// (where there is one), or open any of the links you give it. It is a details element, so it works without script.
import type { ReactNode } from 'react'
import { Share2 } from 'lucide-react'

export function ShareMenu({ title, url, links = [], onMessage }: { title: string; url: string; links?: { label: string; href: string }[]; /** Feedback to show, such as Link copied. */ onMessage?: (text: string) => void }) {
  const say = (t: string) => onMessage?.(t)
  const copy = async () => { try { await navigator.clipboard.writeText(url); say('Link copied') } catch { say('Copy failed. Copy the address from your browser.') } }
  const share = async () => { if (navigator.share) { try { await navigator.share({ title, url }) } catch { /* a dismissed sheet needs no word */ } } else say('Use Copy link to share this page.') }
  return <details className="k-share"><summary className="k-btn" data-variant="outline" data-size="normal"><Share2 aria-hidden="true" />Share</summary>
    <div className="k-share-panel">
      <button type="button" className="k-btn" data-variant="ghost" data-size="normal" onClick={copy}>Copy link</button>
      <button type="button" className="k-btn" data-variant="ghost" data-size="normal" onClick={share}>Share in an app</button>
      {links.map(l => <a key={l.href} className="k-btn" data-variant="ghost" data-size="normal" href={l.href} target="_blank" rel="noopener noreferrer">{l.label as ReactNode}</a>)}
    </div>
  </details>
}
