import { useState, type FormEvent, type ReactNode } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { ApiError } from "@/lib/api"

type Props = {
  title: string
  description: ReactNode
  confirmLabel: string
  destructive?: boolean
  /** Shows an optional "reason" field, saved in the audit log */
  askReason?: boolean
  onConfirm: (reason: string | null) => Promise<void>
  onClose: () => void
}

/** Asks before an action with consequences, e.g. deactivating someone. */
export function ConfirmSheet({ title, description, confirmLabel, destructive, askReason, onConfirm, onClose }: Props) {
  const [reason, setReason] = useState("")
  const [failure, setFailure] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFailure("")
    try {
      await onConfirm(reason.trim() || null)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : "Something went wrong. Please try again.")
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="form-sheet" showCloseButton={false}>
        <div className="form-sheet-header">
          <div>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </div>
          <SheetClose render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close" />}><X /></SheetClose>
        </div>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit} aria-busy={busy}>
          <div className="form-sheet-body">
            <div className="form-grid">
              {failure && <div className="form-error-summary form-field span-4" role="alert">{failure}</div>}
              {askReason && (
                <div className="form-field span-4">
                  <label htmlFor="confirm-reason">Reason</label>
                  <textarea id="confirm-reason" className="form-control" rows={3} maxLength={500} value={reason}
                    placeholder="Optional, kept in the audit log" onChange={event => setReason(event.target.value)} />
                </div>
              )}
            </div>
          </div>
          <div className="form-sheet-footer">
            <Button type="button" variant="outline" className="dashboard-button" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} className="dashboard-button" disabled={busy}>
              {busy ? "Working…" : confirmLabel}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
