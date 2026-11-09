'use client'
// Controls from rune-kit (MIT, Anomaly) for the web: the same names, variants, sizes and states, built on
// Base UI's accessible primitives and moved by Rune's springs.
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group'
import { Radio } from '@base-ui/react/radio'
import { settle, snappy, widthLeads } from '../motion'

export type ButtonVariant = 'neutral' | 'danger' | 'warning' | 'outline' | 'contrast' | 'submit' | 'accent' | 'ghost' | 'ghost-muted' | 'ghost-faint' | 'loading'
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'small' | 'normal' | 'large'; state?: 'hover' | 'pressed' | 'focus' | 'disabled'; icon?: ReactNode }
/** Ten variants, three sizes, five states (`state` forces one, as the stories' data-state does). */
export function Button({ variant = 'neutral', size = 'normal', state, icon, children, className, disabled, ...rest }: ButtonProps) {
  return <button type="button" className={className ? `k-btn ${className}` : 'k-btn'} data-variant={variant} data-size={size} data-state={state} disabled={disabled || state === 'disabled'} aria-busy={variant === 'loading' || undefined} {...rest}>
    {variant === 'loading' ? <Spinner /> : icon}{children}
  </button>
}
/** A square button; its accessible name is its label. */
export function IconButton({ label, children, ...rest }: ButtonProps & { label: string }) {
  return <Button {...rest} className="k-icon-btn" aria-label={label} title={label}>{children}</Button>
}

/**
 * A label whose changed characters roll: up as a value rises, down as it falls. Unchanged characters keep
 * their key and slide to their new place; changed ones leave through one edge and enter from the other
 * with a small stagger (0.03 s a glyph, capped at six). The text stays the accessible label.
 */
export function RollingText({ text, value }: { text: string; value?: number }) {
  const prev = useRef({ text, value, gen: 0 })
  const reduced = useReducedMotion()
  const p = prev.current
  const gen = p.text === text ? p.gen : p.gen + 1
  const dir = value !== undefined && p.value !== undefined && value < p.value ? -1 : 1
  let pre = 0
  while (pre < p.text.length && pre < text.length && p.text[pre] === text[pre]) pre++
  let suf = 0
  while (suf < p.text.length - pre && suf < text.length - pre && p.text[p.text.length - 1 - suf] === text[text.length - 1 - suf]) suf++
  useEffect(() => { prev.current = { text, value, gen } })
  const chars = [...text].map((ch, i) => {
    const middle = i >= pre && i < text.length - suf
    return { ch, key: i < pre ? `p${i}` : middle ? `m${gen}-${i}` : `s${text.length - 1 - i}`, order: middle ? Math.min(i - pre, 6) : 0 }
  })
  const variants = {
    enter: (d: number) => (reduced ? { opacity: 0 } : { y: d > 0 ? '0.9em' : '-0.9em', opacity: 0, filter: 'blur(2px)' }),
    center: { y: 0, opacity: 1, filter: 'blur(0px)' },
    exit: (d: number) => (reduced ? { opacity: 0 } : { y: d > 0 ? '-0.9em' : '0.9em', opacity: 0, filter: 'blur(2px)', transition: settle.exit }),
  }
  return <motion.span className="k-roll" aria-label={text} role="text" layout transition={widthLeads}>
    <AnimatePresence initial={false} mode="popLayout" custom={dir}>
      {chars.map(c => <motion.span key={c.key} aria-hidden="true" custom={dir} variants={variants} initial="enter" animate="center" exit="exit" layout="position" transition={{ ...settle.enter, delay: c.order * 0.03 }}>{c.ch}</motion.span>)}
    </AnimatePresence>
  </motion.span>
}

export function Switch({ checked, onCheckedChange, size = 'standard', label }: { checked?: boolean; onCheckedChange?: (v: boolean) => void; size?: 'compact' | 'standard'; label: string }) {
  return <label className="k-choice"><BaseSwitch.Root className="k-switch" data-size={size} checked={checked} onCheckedChange={v => onCheckedChange?.(v)}><BaseSwitch.Thumb className="k-switch-thumb" /></BaseSwitch.Root>{label}</label>
}
export function Checkbox({ checked, indeterminate, onCheckedChange, label }: { checked?: boolean; indeterminate?: boolean; onCheckedChange?: (v: boolean) => void; label: string }) {
  return <label className="k-choice"><BaseCheckbox.Root className="k-check" checked={checked} indeterminate={indeterminate} onCheckedChange={v => onCheckedChange?.(v)}>
    <BaseCheckbox.Indicator keepMounted render={<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}>{indeterminate ? <path d="M3 6h6" /> : <path d="M2.5 6.2 5 8.6 9.5 3.6" />}</BaseCheckbox.Indicator>
  </BaseCheckbox.Root>{label}</label>
}
export function RadioGroup({ value, onValueChange, options, label }: { value: string; onValueChange: (v: string) => void; options: [string, string][]; label: string }) {
  return <BaseRadioGroup className="k-stack" aria-label={label} value={value} onValueChange={v => onValueChange(String(v))}>
    {options.map(([id, text]) => <label className="k-choice" key={id}><Radio.Root className="k-radio" value={id}><Radio.Indicator keepMounted className="k-radio-dot" /></Radio.Root>{text}</label>)}
  </BaseRadioGroup>
}
/** A pill that slides to the chosen segment on a snappy spring, its width leading its position. Arrow keys move the choice. */
export function SegmentedControl({ value, onValueChange, options, label }: { value: string; onValueChange: (v: string) => void; options: [string, string][]; label: string }) {
  const id = useId()
  const keys = (e: React.KeyboardEvent) => {
    const k = options.findIndex(o => o[0] === value), step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = options[(k + step + options.length) % options.length][0]
    onValueChange(next)
    ;(e.currentTarget.querySelector(`[data-id="${next}"]`) as HTMLElement | null)?.focus()
  }
  return <LayoutGroup id={id}><div className="k-seg" role="radiogroup" aria-label={label} onKeyDown={keys}>
    {options.map(([v, text]) => <button key={v} type="button" role="radio" data-id={v} aria-checked={v === value} tabIndex={v === value ? 0 : -1} className="k-seg-item" onClick={() => onValueChange(v)}>
      {v === value && <motion.span layoutId="pill" className="k-seg-pill" transition={snappy.enter} />}{text}
    </button>)}
  </div></LayoutGroup>
}

export function Badge({ tone = 'neutral', dot, children }: { tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'; dot?: boolean; children: ReactNode }) {
  return <span className="k-badge" data-tone={tone}>{dot && <span className="k-badge-dot" aria-hidden="true" />}{children}</span>
}
/** Keys as keycaps, named for assistive tech. */
export function Keybind({ keys }: { keys: string[] }) {
  return <span className="k-kbd" aria-label={keys.join(' ')}>{keys.map(k => <kbd key={k}>{k}</kbd>)}</span>
}
export const Spinner = () => <span className="k-spinner" role="status" aria-label="Loading" />
export const Loader = () => <span className="k-loader" role="status" aria-label="Loading"><i /><i /><i /></span>
export function Progress({ value, label }: { value: number; label: string }) {
  return <div className="k-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><div className="k-progress-bar" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
}
export function ProgressCircle({ value, label }: { value: number; label: string }) {
  const r = 18, c = 2 * Math.PI * r
  return <svg className="k-ring" viewBox="0 0 44 44" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><circle className="track" cx="22" cy="22" r={r} /><circle className="value" cx="22" cy="22" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, value)) / 100)} /></svg>
}
/** A value that counts on its own, for demos: steps every `every` seconds while visible. */
export function useTicker(every: number, steps: number[]) {
  const [k, setK] = useState(0)
  useEffect(() => { const t = setInterval(() => setK(x => (x + 1) % steps.length), every * 1000); return () => clearInterval(t) }, [every, steps.length])
  return steps[k]
}
