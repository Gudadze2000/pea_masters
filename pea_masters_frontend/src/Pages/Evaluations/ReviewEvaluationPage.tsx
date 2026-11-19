import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { Check, CheckCircle2, ExternalLink, LoaderCircle, RotateCcw, SearchCheck, Undo2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import { ApiError } from "@/lib/api"
import { peopleOrganizations, useSession } from "@/lib/auth"
import { reviewApi, type EvaluationReview, type ReviewEntry } from "@/lib/evaluations"
import type { WosArticle } from "@/lib/wos"
import { ConfirmDialog } from "@/Pages/CvBuilder/cv-ui"
import { EvaluationIcon as Icon } from "@/Pages/EvaluationForm/EvaluationModal"
import { WosBadge } from "@/Pages/EvaluationForm/WosCheck"
import { byItem, formScore, toForm, type RecordDef } from "@/Pages/EvaluationForm/evaluation-model"
import "@/components/forms/forms.css"
import "@/Pages/EvaluationForm/EvaluationForm.css"
import "./SendEvaluationsPage.css"

const pts = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)} pts`
const formatWhen = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
const message = (cause: unknown, fallback: string) => (cause instanceof ApiError ? cause.message : fallback)
const statusLabel = { submitted: "Waiting", approved: "Approved", rejected: "Rejected" } as const

/** The server's own Web of Science look-up of the entry's DOI, on request */
function ServerCheck({ orgId, evaluationId, entry, researcher }: { orgId: string; evaluationId: string; entry: ReviewEntry; researcher: string }) {
  const [state, setState] = useState<{ status: "idle" } | { status: "checking" } | { status: "done"; article: WosArticle } | { status: "error"; message: string }>({ status: "idle" })
  const check = async () => {
    setState({ status: "checking" })
    try {
      setState({ status: "done", article: await reviewApi.checkDoi(orgId, evaluationId, entry.id) })
    } catch (cause) {
      setState({ status: "error", message: message(cause, "Web of Science couldn't be checked.") })
    }
  }
  if (state.status === "idle") return <button type="button" className="text-action review-check" onClick={() => void check()}><SearchCheck aria-hidden="true" />Check {entry.doi} in Web of Science</button>
  if (state.status === "checking") return <p className="review-check" role="status"><LoaderCircle className="wos-spin" aria-hidden="true" />Checking {entry.doi}…</p>
  if (state.status === "error") return <p className="review-check review-check-bad" role="status">{state.message}</p>
  const { article } = state
  if (!article.found) return <p className="review-check review-check-bad" role="status">Checked now: {article.doi} isn't in Web of Science Core Collection.</p>
  return <p className="review-check review-check-good" role="status">
    <CheckCircle2 aria-hidden="true" />
    <span>Checked now: in Web of Science · {[article.source_title, article.year].filter(Boolean).join(", ")}{article.times_cited !== null && ` · cited ${article.times_cited}`}
      {article.includes_you === false && <strong> · {researcher.split(/\s+/).pop()} isn't among its authors</strong>}
      {article.record_url && <> · <a href={article.record_url} target="_blank" rel="noreferrer">Open record<ExternalLink aria-hidden="true" /></a></>}</span>
  </p>
}

function EntryReview({ entry, record, orgId, review, busy, onDecide }: {
  entry: ReviewEntry; record: RecordDef; orgId: string; review: EvaluationReview; busy: boolean
  onDecide: (decision: "approved" | "rejected" | "submitted", comment?: string) => Promise<string | null>
}) {
  const [rejecting, setRejecting] = useState(false)
  const [comment, setComment] = useState("")
  const [error, setError] = useState("")
  const decided = entry.status !== "submitted"
  const reject = async () => {
    if (!comment.trim()) { setError("Say why it's rejected, so they know what to fix."); return }
    const failure = await onDecide("rejected", comment.trim())
    if (failure) setError(failure)
    else { setRejecting(false); setComment(""); setError("") }
  }
  return (
    <div className="review-entry" data-status={entry.status}>
      <div className="review-entry-main">
        <p className="review-entry-title">{entry.description}</p>
        <small>{[entry.detail, record.variablePoints && entry.points !== null ? `${pts(entry.points)} claimed` : `${pts(record.points)}`].filter(Boolean).join(" · ")}</small>
        <div className="review-entry-files">
          {entry.files.length
            ? entry.files.map(file => <a key={file.id} href={file.url} target="_blank" rel="noreferrer"><Icon name="imgIconClip" />{file.name}</a>)
            : <span className="evaluation-no-file">No file attached</span>}
        </div>
        {entry.wos && <WosBadge check={entry.wos} />}
        {entry.doi && <ServerCheck orgId={orgId} evaluationId={review.id} entry={entry} researcher={review.person.display_name} />}
        {entry.status === "rejected" && entry.review_comment && <p className="review-entry-comment">“{entry.review_comment}”</p>}
      </div>
      <div className="review-entry-side">
        <span className={`status-badge ${entry.status === "approved" ? "status-active" : entry.status === "rejected" ? "status-rejected" : "status-submitted"}`}>{statusLabel[entry.status]}</span>
        {review.can_review && !rejecting && (
          <div className="review-entry-actions">
            {decided
              ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void onDecide("submitted")} aria-label={`Undo the decision on ${entry.description}`}><Undo2 />Undo</Button>
              : <>
                <Button size="sm" className="review-approve" disabled={busy} onClick={() => void onDecide("approved")} aria-label={`Approve ${entry.description}`}><Check />Approve</Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setRejecting(true)} aria-label={`Reject ${entry.description}`}><X />Reject</Button>
              </>}
          </div>
        )}
      </div>
      {rejecting && (
        <div className="review-reject">
          <label htmlFor={`reject-${entry.id}`}>Why is it rejected? The researcher sees this.</label>
          <textarea id={`reject-${entry.id}`} className="form-control" rows={2} maxLength={1000} value={comment} placeholder="e.g. The attached PDF is a different article."
            onChange={event => { setComment(event.target.value); setError("") }} />
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="review-reject-actions">
            <Button variant="outline" size="sm" onClick={() => { setRejecting(false); setComment(""); setError("") }}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => void reject()}>Reject entry</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Admins and Coordinators: one researcher's submitted form. Decide on each entry, then approve the form (final: the
 * score counts approved entries) or return it with a comment.
 */
export function ReviewEvaluationPage() {
  const { evaluationId = "" } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const session = useSession()
  const organizations = session ? peopleOrganizations(session) : []
  const org = organizations.find(item => item.id === search.get("org")) ?? organizations[0]
  const [review, setReview] = useState<EvaluationReview | null>(null)
  const [loadError, setLoadError] = useState("")
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState("")
  const [comment, setComment] = useState("")
  const [confirmApprove, setConfirmApprove] = useState(false)

  useEffect(() => {
    if (!org) return
    let cancelled = false
    reviewApi.get(org.id, evaluationId)
      .then(found => { if (!cancelled) setReview(found) })
      .catch(cause => { if (!cancelled) setLoadError(message(cause, "The form couldn't be loaded.")) })
    return () => { cancelled = true }
  }, [org, evaluationId])

  const form = useMemo(() => (review ? toForm(review.structure) : null), [review])

  if (!org) return null
  const breadcrumb = [{ label: "Evaluations", to: "/admin/evaluations" }, { label: review?.person.display_name ?? "Review" }]
  if (!review || !form) {
    return <WorkspaceLayout breadcrumb={breadcrumb}>{() => <div className="dashboard-content">
      <div className="page-heading"><div><h1>Review</h1></div></div>
      {loadError ? <p className="form-error-summary" role="alert">{loadError} <Button variant="link" onClick={() => navigate("/admin/evaluations")}>Back to Evaluations</Button></p> : <p role="status">Loading the form…</p>}
    </div>}</WorkspaceLayout>
  }

  const approvedOnly = byItem(review.entries.filter(entry => entry.status === "approved"))
  const score = formScore(form, approvedOnly)
  const counts = { approved: 0, rejected: 0, submitted: 0 }
  for (const entry of review.entries) counts[entry.status]++
  const grouped = byItem(review.entries)

  async function act(action: () => Promise<EvaluationReview>) {
    setBusy(true)
    try {
      setReview(await action())
      setActionError("")
      return null
    } catch (cause) {
      const failure = message(cause, "That didn't work. Try again.")
      setActionError(failure)
      return failure
    } finally {
      setBusy(false)
    }
  }
  const decide = (entry: ReviewEntry, decision: "approved" | "rejected" | "submitted", text?: string) =>
    act(() => reviewApi.decide(org.id, review.id, entry.id, decision, text))

  const approved = review.review_state === "approved"

  return <WorkspaceLayout breadcrumb={breadcrumb}>{() => <div className="dashboard-content evaluation-page">
    <div className="page-heading">
      <div><h1>{review.person.display_name}</h1><p>{review.period.name} · {review.form_name.en} · submitted {formatWhen(review.submitted_at)}</p></div>
      <div className="evaluation-actions">
        <span className={`status-badge ${approved ? "status-active" : review.review_state === "returned" ? "status-rejected" : "status-submitted"}`}>
          {approved ? "Approved" : review.review_state === "returned" ? "Returned" : review.state === "updating" ? "Being updated" : "Waiting for review"}
        </span>
      </div>
    </div>
    {actionError && <p className="form-error-summary" role="alert">{actionError}</p>}
    {approved
      ? <div className="evaluation-banner evaluation-banner-info"><Icon name="imgIconCheck" /><div><p>Approved: final score {pts(review.final_score ?? 0)}</p><small>By {review.reviewed_by} on {formatWhen(review.reviewed_at!)}.{review.review_comment ? ` “${review.review_comment}”` : ""} The form is locked.</small></div></div>
      : review.state === "updating"
        ? <div className="evaluation-banner evaluation-banner-info"><Icon name="imgIconUnlock" /><div><p>{review.person.display_name} is changing their form</p><small>You're seeing what they sent on {formatWhen(review.submitted_at)}. You can decide on entries now; approve or return the form once they resubmit.</small></div></div>
        : review.review_state === "returned"
          ? <div className="evaluation-banner"><Icon name="imgIconAlert" /><div><p>Returned to {review.person.display_name}</p><small>By {review.reviewed_by} on {formatWhen(review.reviewed_at!)}: “{review.review_comment}” Waiting for them to resubmit.</small></div></div>
          : null}

    <div className="evaluation-columns">
      <div className="evaluation-records">
        {form.parts.map(part => {
          const items = part.items.filter(item => grouped[item.id]?.length)
          return <section key={part.id} className="review-part" aria-label={part.name}>
            <div className="evaluation-part-header">
              <div><h2>{part.numeral && `${part.numeral}. `}{part.name}</h2>{part.rule && <p>{part.rule}</p>}</div>
              <div className="evaluation-part-score"><strong>{pts(score.scores.find(s => s.part.id === part.id)?.counted ?? 0)}</strong><span>approved{part.min !== undefined ? ` · at least ${part.min}` : ""}</span></div>
            </div>
            {items.length === 0 ? <p className="send-muted review-empty">No entries in this part.</p> : items.map(item => (
              <section key={item.id} className="evaluation-record" aria-labelledby={`review-${item.id}`}>
                <div className="evaluation-record-header">
                  <span className="evaluation-record-icon"><Icon name={item.icon} /></span>
                  <div className="evaluation-record-title"><h2 id={`review-${item.id}`}>{item.code && <span className="evaluation-record-code">{item.code}</span>}{item.name}</h2>{item.hint && <small>Asked for: {item.hint}</small>}</div>
                  <div className="evaluation-subtotal"><p>{item.variablePoints ? "Points per entry" : `${pts(item.points)} per entry`}{item.maxPoints !== undefined ? ` · max ${pts(item.maxPoints)}` : ""}</p></div>
                </div>
                {item.variablePoints && <p className="review-rule"><strong>How points are worked out:</strong> {item.variablePoints}</p>}
                {grouped[item.id].map(entry => <EntryReview key={entry.id} entry={entry} record={item} orgId={org.id} review={review} busy={busy} onDecide={(decision, text) => decide(entry, decision, text)} />)}
              </section>
            ))}
          </section>
        })}
      </div>

      <aside className="evaluation-summary" aria-label="Review summary">
        <section className="dashboard-card"><h2>{approved ? "Final score" : "Approved so far"}</h2>
          <div className="evaluation-score"><strong>{Number.isInteger(review.score) ? review.score : review.score.toFixed(1)}</strong><span>{form.totalMinimum !== undefined ? `pts of at least ${form.totalMinimum}` : "pts"}</span></div>
          {form.totalMinimum !== undefined && <progress value={Math.min(review.score, form.totalMinimum)} max={form.totalMinimum} aria-label="Approved points towards the minimum" />}
          <dl className="evaluation-parts">{score.scores.map(({ part, counted }) => (
            <div key={part.id}><dt>{[part.numeral, part.name].filter(Boolean).join(". ")}</dt><dd><span className={part.min === undefined || counted >= part.min ? undefined : "evaluation-short"}>{pts(counted)}</span><small>{part.min !== undefined ? `min ${part.min}` : part.cap !== undefined ? `max ${part.cap}` : ""}</small></dd></div>
          ))}</dl>
          <small>Only approved entries count, within each item's and part's limits.</small>
        </section>
        <section className="dashboard-card review-decision"><h2>Entries</h2>
          <p className="evaluation-check">{review.entries.length} sent · {counts.approved} approved · {counts.rejected} rejected · {counts.submitted} waiting</p>
          {!approved && <>
            <hr />
            <h2>Your decision</h2>
            <div className="form-field">
              <label htmlFor="review-comment">Comment for {review.person.display_name}</label>
              <textarea id="review-comment" className="form-control" rows={3} maxLength={2000} value={comment} placeholder="Needed when you return the form; optional when you approve it." onChange={event => setComment(event.target.value)} />
            </div>
            <Button className="dashboard-button" disabled={busy || !review.can_finish || counts.submitted > 0} onClick={() => setConfirmApprove(true)}><Check />Approve evaluation</Button>
            {counts.submitted > 0 && <small>Approve or reject every entry first: {counts.submitted} still {counts.submitted === 1 ? "needs" : "need"} a decision.</small>}
            <Button variant="outline" className="dashboard-button" disabled={busy || !review.can_finish || !comment.trim()}
              onClick={() => void act(() => reviewApi.finish(org.id, review.id, "returned", comment.trim())).then(failure => { if (!failure) setComment("") })}>
              <RotateCcw />Return to researcher
            </Button>
            {!review.can_finish && review.state === "updating" && <small>They're changing their form; you can decide once they resubmit.</small>}
          </>}
        </section>
      </aside>
    </div>

    <ConfirmDialog
      open={confirmApprove}
      title={`Approve ${review.person.display_name}'s evaluation?`}
      description={`The final score is ${pts(review.score)}. This is final: the form is locked for them and for you.`}
      confirmLabel="Approve evaluation"
      onConfirm={() => { setConfirmApprove(false); void act(() => reviewApi.finish(org.id, review.id, "approved", comment.trim())).then(failure => { if (!failure) setComment("") }) }}
      onCancel={() => setConfirmApprove(false)}
    />
  </div>}</WorkspaceLayout>
}
