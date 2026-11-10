'use client'
// A copy button: press it and the text goes to the clipboard; the icon turns into a tick (or a cross if the browser
// refused) and back after a moment. The three icons are stacked and swapped in CSS, so the button never resizes.
import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react'
import { Check, CircleX, Copy } from 'lucide-react'

export function CopyButton({ text, label = 'Copy', onCopied, onFailed, reset = 1500, className, ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  /** The text, or a function that returns it at the moment of copying. */
  text: string | (() => string)
  label?: string
  onCopied?: (text: string) => void
  onFailed?: (error: unknown) => void
  /** ms before the icon turns back. */
  reset?: number
}) {
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  async function copy() {
    clearTimeout(timer.current)
    try { const value = typeof text === 'function' ? text() : text; await navigator.clipboard.writeText(value); setState('done'); onCopied?.(value) }
    catch (error) { setState('error'); onFailed?.(error) }
    timer.current = setTimeout(() => setState('idle'), reset)
  }
  return <button type="button" className={['k-btn k-icon-btn k-copy', className].filter(Boolean).join(' ')} data-variant="ghost" data-size="normal" data-copy={state} aria-label={label} title={label} onClick={copy} {...rest}>
    <Copy aria-hidden="true" /><Check aria-hidden="true" /><CircleX aria-hidden="true" />
    <span className="k-sr" role="status">{state === 'done' ? 'Copied' : state === 'error' ? 'Copy failed' : ''}</span>
  </button>
}
