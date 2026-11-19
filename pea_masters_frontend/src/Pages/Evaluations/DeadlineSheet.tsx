import { useState, type FormEvent } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { ApiError } from "@/lib/api"
import type { EvaluationPeriod } from "@/lib/evaluations"

const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

/** The day after an ISO date */
function nextDay(iso: string) {
  const day = new Date(`${iso}T12:00:00Z`)
  day.setUTCDate(day.getUTCDate() + 1)
  return day.toISOString().slice(0, 10)
}

/**
 * Admins: gives one person until a later day to fill in and submit their form, even after the period has closed for
 * everyone else; or takes the extension away.
 */
export function DeadlineSheet({ name, period, current, onSave, onClose }: {
  name: string
  period: EvaluationPeriod
  /** Their extension, if they have one */
  current: string | null
  onSave: (endsOn: string | null, reason: string) => Promise<void>
  onClose: () => void
}) {
  const earliest = nextDay(period.ends_on)
  const [endsOn, setEndsOn] = useState(current ?? "")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState("")

  async function save(value: string | null) {
    if (busy) return
    if (value !== null && !value) { setFailure("Pick the new deadline."); return }
    if (value !== null && value < earliest) { setFailure(`Pick a day after the period's own deadline (${dayLabel(period.ends_on)}).`); return }
    setBusy(true)
    setFailure("")
    try {
      await onSave(value, reason.trim())
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : "It couldn't be saved. Please try again.")
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="form-sheet" showCloseButton={false}>
        <div className="form-sheet-header">
          <div>
            <SheetTitle>Extend {name}'s deadline</SheetTitle>
            <SheetDescription>
              {period.name} ends on {dayLabel(period.ends_on)}. {name} can fill in, submit and resubmit until the end of the day you pick (Tbilisi time); everyone else keeps the period's deadline.
            </SheetDescription>
          </div>
          <SheetClose render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close" />}><X /></SheetClose>
        </div>
        <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={(event: FormEvent) => { event.preventDefault(); void save(endsOn) }} aria-busy={busy}>
          <div className="form-sheet-body">
            <div className="form-grid">
              {failure && <div className="form-error-summary form-field span-4" role="alert">{failure}</div>}
              <div className="form-field span-2">
                <label htmlFor="deadline-ends-on">New deadline</label>
                <input id="deadline-ends-on" type="date" className="form-control" min={earliest} max="9999-12-31" value={endsOn} onChange={event => setEndsOn(event.target.value)} />
              </div>
              <div className="form-field span-4">
                <label htmlFor="deadline-reason">Reason</label>
                <textarea id="deadline-reason" className="form-control" rows={3} maxLength={500} value={reason} placeholder="Optional, kept in the audit log" onChange={event => setReason(event.target.value)} />
              </div>
              {current && (
                <div className="form-field span-4">
                  <p className="field-hint">They have until {dayLabel(current)} now.</p>
                  <Button type="button" variant="outline" className="dashboard-button deadline-remove" disabled={busy} onClick={() => void save(null)}>Remove the extension</Button>
                </div>
              )}
            </div>
          </div>
          <div className="form-sheet-footer">
            <Button type="button" variant="outline" className="dashboard-button" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="dashboard-button" disabled={busy}>{busy ? "Saving…" : "Extend deadline"}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
