'use client'
// Overlays from rune-kit (MIT, Anomaly): menu, popover, tooltip, hover card, dialog and toast, on Base UI.
// Each opens out of its trigger (transform-origin follows the anchor) on Rune's morph spring and leaves faster.
import type { ReactNode } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { Menu as BaseMenu } from '@base-ui/react/menu'
import { Popover as BasePopover } from '@base-ui/react/popover'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { PreviewCard } from '@base-ui/react/preview-card'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { Toast } from '@base-ui/react/toast'
import { Button, Keybind } from './controls'

export type MenuEntry =
  | { kind: 'item'; label: string; keys?: string[]; onSelect?: () => void; disabled?: boolean }
  | { kind: 'check'; label: string; checked: boolean; onChange: (v: boolean) => void }
  | { kind: 'radio'; value: string; options: [string, string][]; onChange: (v: string) => void }
  | { kind: 'sep' }
  | { kind: 'label'; label: string }
  | { kind: 'sub'; label: string; items: MenuEntry[] }
function entries(items: MenuEntry[]): ReactNode {
  return items.map((e, k) => {
    if (e.kind === 'sep') return <BaseMenu.Separator key={k} className="k-sep" />
    if (e.kind === 'label') return <BaseMenu.GroupLabel key={k} className="k-group-label">{e.label}</BaseMenu.GroupLabel>
    if (e.kind === 'check') return <BaseMenu.CheckboxItem key={k} className="k-item" checked={e.checked} onCheckedChange={e.onChange}><span className="k-item-indicator"><BaseMenu.CheckboxItemIndicator><Check size={13} /></BaseMenu.CheckboxItemIndicator></span>{e.label}</BaseMenu.CheckboxItem>
    if (e.kind === 'radio') return <BaseMenu.RadioGroup key={k} value={e.value} onValueChange={v => e.onChange(String(v))}>{e.options.map(([v, l]) => <BaseMenu.RadioItem key={v} value={v} className="k-item"><span className="k-item-indicator"><BaseMenu.RadioItemIndicator><Check size={13} /></BaseMenu.RadioItemIndicator></span>{l}</BaseMenu.RadioItem>)}</BaseMenu.RadioGroup>
    if (e.kind === 'sub') return <BaseMenu.SubmenuRoot key={k}><BaseMenu.SubmenuTrigger className="k-item"><span className="k-item-indicator" />{e.label}<ChevronRight size={14} className="k-item-end" /></BaseMenu.SubmenuTrigger><BaseMenu.Portal><BaseMenu.Positioner className="k-layer" sideOffset={-4} alignOffset={-4}><BaseMenu.Popup className="k-popup">{entries(e.items)}</BaseMenu.Popup></BaseMenu.Positioner></BaseMenu.Portal></BaseMenu.SubmenuRoot>
    return <BaseMenu.Item key={k} className="k-item" disabled={e.disabled} onClick={e.onSelect}><span className="k-item-indicator" />{e.label}{e.keys && <Keybind keys={e.keys} />}</BaseMenu.Item>
  })
}
export function Menu({ trigger, items }: { trigger: ReactNode; items: MenuEntry[] }) {
  return <BaseMenu.Root>
    <BaseMenu.Trigger render={<Button />}>{trigger}</BaseMenu.Trigger>
    <BaseMenu.Portal><BaseMenu.Positioner className="k-layer" sideOffset={6} align="start"><BaseMenu.Popup className="k-popup">{entries(items)}</BaseMenu.Popup></BaseMenu.Positioner></BaseMenu.Portal>
  </BaseMenu.Root>
}

export function Popover({ trigger, title, children }: { trigger: ReactNode; title: string; children: ReactNode }) {
  return <BasePopover.Root>
    <BasePopover.Trigger render={<Button />}>{trigger}</BasePopover.Trigger>
    <BasePopover.Portal><BasePopover.Positioner className="k-layer" sideOffset={8}><BasePopover.Popup className="k-popup k-pop"><BasePopover.Title render={<h4 />}>{title}</BasePopover.Title><BasePopover.Description render={<p />}>{children}</BasePopover.Description></BasePopover.Popup></BasePopover.Positioner></BasePopover.Portal>
  </BasePopover.Root>
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <BaseTooltip.Provider delay={450}><BaseTooltip.Root>
    <BaseTooltip.Trigger render={<span />}>{children}</BaseTooltip.Trigger>
    <BaseTooltip.Portal><BaseTooltip.Positioner className="k-layer" sideOffset={8}><BaseTooltip.Popup className="k-tooltip">{label}</BaseTooltip.Popup></BaseTooltip.Positioner></BaseTooltip.Portal>
  </BaseTooltip.Root></BaseTooltip.Provider>
}

export function HoverCard({ trigger, href, children }: { trigger: ReactNode; href: string; children: ReactNode }) {
  return <PreviewCard.Root>
    <PreviewCard.Trigger href={href}>{trigger}</PreviewCard.Trigger>
    <PreviewCard.Portal><PreviewCard.Positioner className="k-layer" sideOffset={8}><PreviewCard.Popup className="k-popup k-pop">{children}</PreviewCard.Popup></PreviewCard.Positioner></PreviewCard.Portal>
  </PreviewCard.Root>
}

export function Dialog({ trigger, title, description, confirm, onConfirm }: { trigger: ReactNode; title: string; description: string; confirm: string; onConfirm?: () => void }) {
  return <BaseDialog.Root>
    <BaseDialog.Trigger render={<Button />}>{trigger}</BaseDialog.Trigger>
    <BaseDialog.Portal><BaseDialog.Backdrop className="k-backdrop" /><BaseDialog.Popup className="k-dialog">
      <BaseDialog.Title render={<h3 />}>{title}</BaseDialog.Title>
      <BaseDialog.Description render={<p />}>{description}</BaseDialog.Description>
      <div className="k-actions"><BaseDialog.Close render={<Button variant="ghost" />}>Cancel</BaseDialog.Close><BaseDialog.Close render={<Button variant="submit" />} onClick={onConfirm}>{confirm}</BaseDialog.Close></div>
    </BaseDialog.Popup></BaseDialog.Portal>
  </BaseDialog.Root>
}

/** Toasts queue and stack in a polite live region; each can be swiped or closed away. */
export function Toaster({ children }: { children: ReactNode }) {
  return <Toast.Provider limit={3}>{children}<Toast.Portal><Toast.Viewport className="k-toasts"><Toasts /></Toast.Viewport></Toast.Portal></Toast.Provider>
}
function Toasts() {
  const { toasts } = Toast.useToastManager()
  return toasts.map(t => <Toast.Root key={t.id} toast={t} className="k-toast" swipeDirection={['right', 'down']}><Toast.Title className="k-toast-title" /><Toast.Description className="k-toast-desc" /></Toast.Root>)
}
export const useToast = () => Toast.useToastManager()
