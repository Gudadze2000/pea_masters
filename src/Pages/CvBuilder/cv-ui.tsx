import { useRef, type KeyboardEvent, type ReactNode } from "react"
import { AlertDialog } from "@base-ui/react/alert-dialog"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Label + control + hint/error, using the shared .form-field styles */
export function Field({ id, label, hint, error, span = 4, children }: { id: string; label: string; hint?: string; error?: string | null; span?: 1 | 2 | 4; children: ReactNode }) {
  return (
    <div className={`form-field span-${span}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <p id={`${id}-error`} className="field-error">{error}</p> : hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
    </div>
  )
}

type SegmentOption<T extends string> = { value: T; label: string; icon?: LucideIcon }

/** Two or three mutually exclusive choices, styled like the top-bar language switch but larger */
export function Segmented<T extends string>({ label, value, options, onChange, className }: { label: string; value: T; options: SegmentOption<T>[]; onChange: (value: T) => void; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div className={`segmented ${className ?? ""}`} role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const Icon = option.icon
        const checked = option.value === value
        return (
          <button
            key={option.value}
            ref={element => { refs.current[index] = element }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={event => onKeyDown(event, index)}
          >
            {Icon && <Icon aria-hidden="true" />}{option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Confirmation dialog with the same look as "Delete this entry?" on Qualifications */
export function ConfirmDialog({ open, title, description, confirmLabel, danger, onConfirm, onCancel }: {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={next => { if (!next) onCancel() }}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="confirm-backdrop" />
        <AlertDialog.Popup className="confirm-dialog">
          <AlertDialog.Title className="confirm-title">{title}</AlertDialog.Title>
          <AlertDialog.Description className="confirm-description" render={<div />}>{description}</AlertDialog.Description>
          <div className="confirm-actions">
            <AlertDialog.Close render={<Button variant="outline" className="dashboard-button" />}>Cancel</AlertDialog.Close>
            <Button className={`dashboard-button ${danger ? "danger-solid" : ""}`} onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
