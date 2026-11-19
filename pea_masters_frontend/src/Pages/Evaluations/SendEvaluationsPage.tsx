import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import { useNavigate } from "react-router"
import { Check, ClipboardCheck, Send, Undo2, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import { ApiError } from "@/lib/api"
import { peopleOrganizations, useSession } from "@/lib/auth"
import { formsApi, periodsApi, sendingApi, type EvaluationBrief, type EvaluationPeriod, type FormSummary, type RosterRow, type SendResult } from "@/lib/evaluations"
import { useLanguage } from "@/lib/language-context"
import { localName } from "@/lib/people"
import { ConfirmSheet } from "@/Pages/People/ConfirmSheet"
import "@/components/forms/forms.css"
import "@/Pages/People/PeoplePage.css"
import "./SendEvaluationsPage.css"

const formatDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

/** Where someone is with the period's form, for the status column */
function progress(evaluation: EvaluationBrief | null): { label: string; tone: string } {
  if (!evaluation) return { label: "Not sent", tone: "status-draft" }
  if (evaluation.review_state === "approved") return { label: "Approved", tone: "status-active" }
  if (evaluation.review_state === "returned" && evaluation.state === "submitted") return { label: "Returned", tone: "status-rejected" }
  if (evaluation.state === "submitted") return { label: "To review", tone: "status-submitted" }
  if (evaluation.state === "updating") return { label: "Updating", tone: "status-submitted" }
  return evaluation.started ? { label: "In progress", tone: "status-submitted" } : { label: "Not started", tone: "status-draft" }
}

/** A form can be sent (or replaced) until the person adds their first entry */
const sendable = (row: RosterRow) => !row.evaluation?.started

function resultMessage(result: SendResult) {
  const parts = [
    result.sent && `Sent to ${result.sent} ${result.sent === 1 ? "person" : "people"}`,
    result.replaced && `${result.replaced} got this form instead of their earlier one`,
    result.unchanged && `${result.unchanged} already had it`,
  ].filter(Boolean)
  const done = parts.length ? `${parts.join(" · ")}.` : "Nothing to send."
  return result.skipped.length ? `${done} Already started, so kept as it is: ${result.skipped.join(", ")}.` : done
}

/**
 * Admins and Coordinators: send a form to researchers for an evaluation period and follow where each of them is.
 * Coordinators see the researchers they coordinate; Admins everyone in the organization.
 */
export function SendEvaluationsPage() {
  const session = useSession()
  const navigate = useNavigate()
  const { language } = useLanguage()
  const organizations = session ? peopleOrganizations(session) : []
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? "")
  const org = organizations.find(item => item.id === orgId) ?? organizations[0]

  const [periods, setPeriods] = useState<EvaluationPeriod[] | null>(null)
  const [periodId, setPeriodId] = useState("")
  const [roster, setRoster] = useState<RosterRow[] | null>(null)
  const [forms, setForms] = useState<FormSummary[]>([])
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [withdrawing, setWithdrawing] = useState<RosterRow | null>(null)
  const [notice, setNotice] = useState("")
  const noticeTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const announce = (message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(""), 8000)
  }

  // Periods and forms for the organization; the open period (or the newest) is picked first
  useEffect(() => {
    if (!org) return
    let cancelled = false
    void Promise.all([periodsApi.list(org.id), formsApi.list(org.id)]).then(([periodList, formList]) => {
      if (cancelled) return
      setPeriods(periodList)
      setForms(formList)
      setPeriodId(current => periodList.some(p => p.id === current) ? current : (periodList.find(p => p.status === "open") ?? periodList[0])?.id ?? "")
      setError("")
    }).catch(cause => { if (!cancelled) setError(cause instanceof ApiError ? cause.message : "The evaluation periods couldn't be loaded.") })
    return () => { cancelled = true }
  }, [org])

  const loadRoster = useCallback(async () => {
    if (!org || !periodId) return
    try {
      setRoster(await sendingApi.roster(org.id, periodId))
      setError("")
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The list of researchers couldn't be loaded.")
    }
  }, [org, periodId])

  useEffect(() => { setRoster(null); setSelected(new Set()); void loadRoster() }, [loadRoster])

  if (!org) return null // RequireStaff only lets Admins and Coordinators in

  const period = periods?.find(p => p.id === periodId)
  const closed = period?.status === "closed"
  const isAdmin = session?.isRoot || org.roles.includes("admin")
  const rows = roster ?? []
  const choosable = rows.filter(sendable)
  const allChosen = choosable.length > 0 && choosable.every(row => selected.has(row.person.id))
  const counts = {
    notSent: rows.filter(row => !row.evaluation).length,
    submitted: rows.filter(row => row.evaluation?.submitted_at).length,
    toReview: rows.filter(row => row.evaluation?.state === "submitted" && !row.evaluation.review_state).length,
  }

  const toggle = (id: string) => setSelected(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  return (
    <WorkspaceLayout breadcrumb={[{ label: "Evaluations" }]}>
      {() => (
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <h1>Evaluations</h1>
              <p>{isAdmin ? "Send a form to researchers for an evaluation period and see where each of them is." : "Send a form to the researchers you coordinate and see where each of them is."}</p>
            </div>
            <div className="page-actions">
              <span className="save-status" role="status">{notice && <><Check aria-hidden="true" />{notice}</>}</span>
              {organizations.length > 1 && (
                <select className="form-control org-select" aria-label="Organization" value={org.id} onChange={event => { setPeriods(null); setOrgId(event.target.value) }}>
                  {organizations.map(item => <option key={item.id} value={item.id}>{localName(item.name, language)}</option>)}
                </select>
              )}
            </div>
          </div>

          {error && <p className="form-error-summary" role="alert">{error} <Button variant="link" onClick={() => void loadRoster()}>Try again</Button></p>}
          {periods === null && !error && <p role="status">Loading…</p>}

          {periods !== null && periods.length === 0 && (
            <section className="dashboard-card">
              <h2 className="send-empty-title">No evaluation periods yet</h2>
              <p className="send-muted">Forms are sent for an evaluation period, which an Admin sets up under People → Evaluation periods.</p>
              {isAdmin && <Button variant="outline" className="dashboard-button send-empty-action" onClick={() => navigate("/admin/people")}>Set up a period</Button>}
            </section>
          )}

          {period && (
            <section className="dashboard-card" aria-labelledby="send-heading">
              <div className="card-heading send-toolbar">
                <div className="form-field">
                  <label htmlFor="send-period">Evaluation period</label>
                  <select id="send-period" className="form-control" value={period.id} onChange={event => setPeriodId(event.target.value)}>
                    {periods!.map(p => <option key={p.id} value={p.id}>{p.name} ({p.status === "open" ? "open" : p.status === "upcoming" ? "upcoming" : "closed"})</option>)}
                  </select>
                </div>
                <p id="send-heading" className="send-muted">
                  {formatDate(period.starts_on)} – {formatDate(period.ends_on)}
                  {roster && ` · ${rows.length} ${rows.length === 1 ? "researcher" : "researchers"} · ${counts.submitted} submitted · ${counts.toReview} to review · ${counts.notSent} without a form`}
                </p>
                <Button className="dashboard-button" disabled={closed || selected.size === 0} onClick={() => setSending(true)}>
                  <Send />{selected.size ? `Send form to ${selected.size}` : "Send form"}
                </Button>
              </div>
              {closed && <p className="send-note">This period's deadline has passed, so no more forms can be sent for it.</p>}

              {roster === null ? <p role="status">Loading the researchers…</p> : (
                <div className="data-table-wrap">
                  <table className="data-table send-table">
                    <thead>
                      <tr>
                        <th scope="col" className="send-check">
                          <input type="checkbox" aria-label="Select everyone who can be sent a form" checked={allChosen} disabled={closed || choosable.length === 0}
                            onChange={() => setSelected(allChosen ? new Set() : new Set(choosable.map(row => row.person.id)))} />
                        </th>
                        <th scope="col">Researcher</th><th scope="col">Department</th><th scope="col">Form</th><th scope="col">Status</th><th scope="col">Entries</th>
                        <th scope="col"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0
                        ? <tr><td colSpan={7} className="data-table-empty"><Users aria-hidden="true" /> {isAdmin ? "No researchers in the organization yet." : "No researchers in your department yet."}</td></tr>
                        : rows.map(row => {
                          const state = progress(row.evaluation)
                          const name = row.person.display_name
                          return (
                            <tr key={row.person.id}>
                              <td className="send-check">
                                <input type="checkbox" aria-label={`Select ${name}`} checked={selected.has(row.person.id)} disabled={closed || !sendable(row)}
                                  title={sendable(row) ? undefined : "They've started their form, so it can't be replaced"} onChange={() => toggle(row.person.id)} />
                              </td>
                              <td><div className="person-name"><span>{name}</span><small>{row.person.email}</small></div></td>
                              <td>{row.person.department ? localName(row.person.department.name, language) : <span className="muted">—</span>}</td>
                              <td>{row.evaluation ? row.evaluation.form_name.en : <span className="muted">—</span>}</td>
                              <td>
                                <span className={`status-badge ${state.tone}`}>{state.label}</span>
                                {row.evaluation?.final_score !== null && row.evaluation?.final_score !== undefined
                                  ? <small className="send-when">Final score {row.evaluation.final_score}</small>
                                  : row.evaluation?.submitted_at && <small className="send-when">Submitted {formatDate(row.evaluation.submitted_at)}</small>}
                              </td>
                              <td>{row.evaluation ? row.evaluation.entries : ""}</td>
                              <td>
                                <div className="row-actions">
                                  {row.evaluation?.submitted_at && (
                                    <Button variant="outline" size="sm" className="send-review" aria-label={`Review ${name}'s form`}
                                      onClick={() => navigate(`/admin/evaluations/${row.evaluation!.id}?org=${org.id}`)}>
                                      <ClipboardCheck />{row.evaluation.review_state === "approved" ? "View" : "Review"}
                                    </Button>
                                  )}
                                  {row.evaluation && !row.evaluation.started && (
                                    <Button variant="outline" size="icon" className="icon-button" aria-label={`Withdraw ${name}'s form`} title="Withdraw the form" onClick={() => setWithdrawing(row)}><Undo2 /></Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {sending && period && (
            <SendSheet
              period={period}
              forms={forms}
              people={rows.filter(row => selected.has(row.person.id))}
              onSend={async formId => {
                const result = await sendingApi.send(org.id, period.id, formId, [...selected])
                setSending(false)
                setSelected(new Set())
                announce(resultMessage(result))
                await loadRoster()
              }}
              onClose={() => setSending(false)}
            />
          )}

          {withdrawing?.evaluation && (
            <ConfirmSheet
              title={`Withdraw ${withdrawing.person.display_name}'s form?`}
              description="They haven't started it yet. It disappears from their evaluation page, and you can send them a form again later."
              confirmLabel="Withdraw form"
              destructive
              onConfirm={async () => {
                await sendingApi.withdraw(org.id, withdrawing.evaluation!.id)
                announce(`${withdrawing.person.display_name}'s form was withdrawn.`)
                setWithdrawing(null)
                await loadRoster()
              }}
              onClose={() => setWithdrawing(null)}
            />
          )}
        </div>
      )}
    </WorkspaceLayout>
  )
}

/** Picks the form to send and confirms who gets it */
function SendSheet({ period, forms, people, onSend, onClose }: {
  period: EvaluationPeriod; forms: FormSummary[]; people: RosterRow[]; onSend: (formId: string) => Promise<void>; onClose: () => void
}) {
  const [formId, setFormId] = useState(forms[0]?.id ?? "")
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState("")
  const replacing = people.filter(row => row.evaluation && row.evaluation.form_ref !== formId).length

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy || !formId) return
    setBusy(true)
    setFailure("")
    try {
      await onSend(formId)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : "The form couldn't be sent. Please try again.")
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="form-sheet" showCloseButton={false}>
        <div className="form-sheet-header">
          <div>
            <SheetTitle>Send a form</SheetTitle>
            <SheetDescription>{people.length} {people.length === 1 ? "researcher gets" : "researchers get"} it for {period.name}.</SheetDescription>
          </div>
          <SheetClose render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close" />}><X /></SheetClose>
        </div>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit} aria-busy={busy}>
          <div className="form-sheet-body">
            <div className="form-grid">
              {failure && <div className="form-error-summary form-field span-4" role="alert">{failure}</div>}
              <div className="form-field span-4">
                <label htmlFor="send-form">Form</label>
                <select id="send-form" className="form-control" value={formId} onChange={event => setFormId(event.target.value)}>
                  {forms.map(form => <option key={form.id} value={form.id}>{form.name.en}{form.built_in ? " (built in)" : ""}</option>)}
                </select>
                <p className="field-hint">Each researcher gets a copy of the form as it is now; changing the form later doesn't change theirs.</p>
              </div>
              <div className="form-field span-4">
                <p className="send-sheet-label">Sending to</p>
                <ul className="send-sheet-people">{people.map(row => <li key={row.person.id}>{row.person.display_name}</li>)}</ul>
                {replacing > 0 && <p className="field-hint">{replacing} of them already {replacing === 1 ? "has" : "have"} another form they haven't started: they get this one instead.</p>}
              </div>
            </div>
          </div>
          <div className="form-sheet-footer">
            <Button type="button" variant="outline" className="dashboard-button" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="dashboard-button" disabled={busy || !formId}><Send />{busy ? "Sending…" : "Send form"}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
