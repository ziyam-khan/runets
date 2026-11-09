'use client'
// Inputs from rune-kit (MIT, Anomaly): text field, select, combobox and shortcut recorder, on Base UI.
import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Field } from '@base-ui/react/field'
import { Input } from '@base-ui/react/input'
import { Select as BaseSelect } from '@base-ui/react/select'
import { Combobox as BaseCombobox } from '@base-ui/react/combobox'
import { Keybind } from './controls'

/** A labelled field: its description and error are wired to the control for assistive tech. */
export function TextField({ label, description, error, multiline, placeholder, value, onChange }: { label: string; description?: string; error?: string; multiline?: boolean; placeholder?: string; value: string; onChange: (v: string) => void }) {
  return <Field.Root className="k-field" invalid={!!error}>
    <Field.Label className="k-label">{label}</Field.Label>
    {multiline
      ? <Field.Control render={<textarea />} className="k-input" placeholder={placeholder} value={value} onChange={e => onChange((e.target as unknown as HTMLTextAreaElement).value)} />
      : <Input className="k-input" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />}
    {description && <Field.Description className="k-desc">{description}</Field.Description>}
    <Field.Error className="k-error" match={!!error}>{error}</Field.Error>
  </Field.Root>
}

export type Option = { value: string; label: string; group?: string }
/** Options in a popover anchored to the trigger, grouped, the chosen one checked. */
export function Select({ options, value, onValueChange, label }: { options: Option[]; value: string; onValueChange: (v: string) => void; label: string }) {
  const groups = [...new Set(options.map(o => o.group ?? ''))]
  return <BaseSelect.Root items={options} value={value} onValueChange={v => onValueChange(String(v))}>
    <BaseSelect.Trigger className="k-btn k-trigger" aria-label={label}><BaseSelect.Value /><BaseSelect.Icon className="k-chev"><ChevronDown size={15} /></BaseSelect.Icon></BaseSelect.Trigger>
    <BaseSelect.Portal><BaseSelect.Positioner sideOffset={6} alignItemWithTrigger={false} className="k-layer"><BaseSelect.Popup className="k-popup">
      {groups.map(g => <BaseSelect.Group key={g}>
        {g && <BaseSelect.GroupLabel className="k-group-label">{g}</BaseSelect.GroupLabel>}
        {options.filter(o => (o.group ?? '') === g).map(o => <BaseSelect.Item key={o.value} value={o.value} className="k-item"><span className="k-item-indicator"><BaseSelect.ItemIndicator><Check size={13} /></BaseSelect.ItemIndicator></span><BaseSelect.ItemText>{o.label}</BaseSelect.ItemText></BaseSelect.Item>)}
      </BaseSelect.Group>)}
    </BaseSelect.Popup></BaseSelect.Positioner></BaseSelect.Portal>
  </BaseSelect.Root>
}

/** Type to filter, arrows to move, Enter to choose. */
export function Combobox({ items, label, placeholder, onValueChange }: { items: string[]; label: string; placeholder?: string; onValueChange?: (v: string | null) => void }) {
  return <BaseCombobox.Root items={items} onValueChange={v => onValueChange?.(v as string | null)}>
    <BaseCombobox.Input className="k-input" placeholder={placeholder} aria-label={label} />
    <BaseCombobox.Portal><BaseCombobox.Positioner sideOffset={6} className="k-layer"><BaseCombobox.Popup className="k-popup">
      <BaseCombobox.Empty className="k-empty">Nothing matches.</BaseCombobox.Empty>
      <BaseCombobox.List className="k-combo-list">{(item: string) => <BaseCombobox.Item key={item} value={item} className="k-item"><span className="k-item-indicator"><BaseCombobox.ItemIndicator><Check size={13} /></BaseCombobox.ItemIndicator></span>{item}</BaseCombobox.Item>}</BaseCombobox.List>
    </BaseCombobox.Popup></BaseCombobox.Positioner></BaseCombobox.Portal>
  </BaseCombobox.Root>
}

const glyph: Record<string, string> = { Meta: '⌘', Control: '⌃', Alt: '⌥', Shift: '⇧', ' ': 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: '↩', Escape: 'Esc', Backspace: '⌫' }
/** Press a combination and it is recorded as keycaps; Escape cancels, Backspace clears. */
export function ShortcutRecorder({ value, onChange, label }: { value: string[]; onChange: (keys: string[]) => void; label: string }) {
  const [recording, setRecording] = useState(false)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) return
    e.preventDefault()
    if (e.key === 'Escape') { setRecording(false); return }
    if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey) { onChange([]); setRecording(false); return }
    if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return
    const keys = [e.ctrlKey && '⌃', e.altKey && '⌥', e.shiftKey && '⇧', e.metaKey && '⌘', glyph[e.key] ?? e.key.toUpperCase()].filter(Boolean) as string[]
    onChange(keys); setRecording(false)
  }
  return <button type="button" className="k-btn k-trigger" aria-label={`${label}: ${recording ? 'press keys' : value.join(' ') || 'none'}`} aria-pressed={recording} onClick={() => setRecording(r => !r)} onKeyDown={onKeyDown} onBlur={() => setRecording(false)}>
    {recording ? <span className="k-desc">Press keys…</span> : value.length ? <Keybind keys={value} /> : <span className="k-desc">Record shortcut</span>}
  </button>
}
