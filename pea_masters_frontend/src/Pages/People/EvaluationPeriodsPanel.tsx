import { useCallback, useEffect, useState } from "react"
import { CalendarRange, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RecordSheet } from "@/components/forms/RecordSheet"
import type { FieldDef } from "@/components/forms/field-types"
import { ApiError } from "@/lib/api"
import { periodsApi, type EvaluationPeriod, type PeriodStatus } from "@/lib/evaluations"
import { ConfirmSheet } from "./ConfirmSheet"

const thisYear = new Date().getFullYear()
const YEARS = Array.from({ length: 16 }, (_, i) => String(thisYear + 2 - i))

const fields: FieldDef[] = [
  { name: "name", label: "Name", type: "text", required: true, placeholder: "Annual evaluation 2025-2026" },
  { name: "starts_on", label: "Opens on", type: "date", required: true, span: 2 },
  { name: "ends_on", label: "Deadline", type: "date", required: true, span: 2, hint: "Forms can be submitted until the end of this day (Tbilisi time)." },
  { name: "publication_from", label: "Publications from", type: "select", required: true, span: 2, options: YEARS },
  { name: "publication_to", label: "Publications to", type: "select", required: true, span: 2, options: YEARS, hint: "Which publication years count for this evaluation." },
]

const statusLabel: Record<PeriodStatus, string> = { upcoming: "Upcoming", open: "Open", closed: "Closed" }
const statusClass: Record<PeriodStatus, string> = { upcoming: "status-submitted", open: "status-active", closed: "status-draft" }

const formatDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

type Editor = { period: EvaluationPeriod | null; session: number }

/** Admins: the organization's evaluation periods, each with its dates and the publication years that count. */
export function EvaluationPeriodsPanel({ orgId, onChanged }: { orgId: string; onChanged: (message: string) => void }) {
  const [periods, setPeriods] = useState<EvaluationPeriod[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [archiving, setArchiving] = useState<EvaluationPeriod | null>(null)

  const load = useCallback(async () => {
    try {
      setPeriods(await periodsApi.list(orgId))
      setError(null)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The evaluation periods couldn't be loaded.")
    }
  }, [orgId])

  useEffect(() => { void load() }, [load])

  const save = async (values: Record<string, string>) => {
    const input = {
      name: values.name, starts_on: values.starts_on, ends_on: values.ends_on,
      publication_from: Number(values.publication_from), publication_to: Number(values.publication_to),
    }
    try {
      if (editor?.period) await periodsApi.update(orgId, editor.period.id, input)
      else await periodsApi.create(orgId, input)
      onChanged(editor?.period ? `${input.name} was updated.` : `${input.name} was added.`)
      setEditor(null)
      await load()
      return null
    } catch (cause) {
      return cause instanceof ApiError ? cause.message : "It couldn't be saved. Try again."
    }
  }

  const initial = (period: EvaluationPeriod | null): Record<string, string> => period
    ? { name: period.name, starts_on: period.starts_on, ends_on: period.ends_on, publication_from: String(period.publication_from), publication_to: String(period.publication_to) }
    : { name: "", starts_on: "", ends_on: "", publication_from: String(thisYear - 2), publication_to: String(thisYear) }

  return (
    <section className="dashboard-card evaluation-periods" aria-labelledby="periods-heading">
      <div className="card-heading">
        <div>
          <h2 id="periods-heading">Evaluation periods</h2>
          <p className="card-subtitle">Each period has a deadline and the publication years that count. Coordinators send forms to their researchers for a period.</p>
        </div>
        <Button className="dashboard-button" onClick={() => setEditor({ period: null, session: Date.now() })}><Plus />Add period</Button>
      </div>

      {error && <p className="form-error-summary" role="alert">{error} <Button variant="link" onClick={() => void load()}>Try again</Button></p>}
      {periods === null && !error && <p role="status">Loading evaluation periods…</p>}
      {periods !== null && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr><th scope="col">Period</th><th scope="col">Opens</th><th scope="col">Deadline</th><th scope="col">Publications</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {periods.length === 0
                ? <tr><td colSpan={6} className="data-table-empty"><CalendarRange aria-hidden="true" /> No evaluation periods yet. Add the first one to start an evaluation.</td></tr>
                : periods.map(period => (
                  <tr key={period.id}>
                    <td>{period.name}</td>
                    <td className="nowrap">{formatDate(period.starts_on)}</td>
                    <td className="nowrap">{formatDate(period.ends_on)}</td>
                    <td className="nowrap">{period.publication_from === period.publication_to ? period.publication_from : `${period.publication_from}–${period.publication_to}`}</td>
                    <td><span className={`status-badge ${statusClass[period.status]}`}>{statusLabel[period.status]}</span></td>
                    <td>
                      <div className="row-actions">
                        <Button variant="outline" size="icon" className="icon-button" aria-label={`Edit ${period.name}`} onClick={() => setEditor({ period, session: Date.now() })}><Pencil /></Button>
                        <Button variant="outline" size="icon" className="icon-button danger" aria-label={`Remove ${period.name}`} onClick={() => setArchiving(period)}><Trash2 /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <RecordSheet
        open={editor !== null}
        onOpenChange={open => { if (!open) setEditor(null) }}
        formKey={editor?.session ?? 0}
        idPrefix="period"
        title={editor?.period ? "Edit evaluation period" : "Add evaluation period"}
        description={editor?.period ? "Changing the deadline applies to everyone in this period." : "Researchers can fill in forms between the opening day and the deadline."}
        fields={fields}
        initialValues={initial(editor?.period ?? null)}
        submitLabel={editor?.period ? "Save period" : "Add period"}
        validate={values => {
          const errors: Record<string, string> = {}
          if (values.starts_on && values.ends_on && values.ends_on < values.starts_on) errors.ends_on = "The deadline can't be before the opening day."
          if (Number(values.publication_to) < Number(values.publication_from)) errors.publication_to = "Can't be before the first year."
          return errors
        }}
        onSave={save}
      />

      {archiving && (
        <ConfirmSheet
          title={`Remove ${archiving.name}?`}
          description="It disappears from the list. Nothing is deleted from the database, so anything that refers to it keeps working."
          confirmLabel="Remove period"
          destructive
          onConfirm={async () => {
            await periodsApi.archive(orgId, archiving.id)
            onChanged(`${archiving.name} was removed.`)
            setArchiving(null)
            await load()
          }}
          onClose={() => setArchiving(null)}
        />
      )}
    </section>
  )
}
