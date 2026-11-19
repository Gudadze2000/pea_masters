import { useEffect, useState, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { ContentScrollbar } from "@/components/layout/ContentScrollbar"
import { WorkspaceSidebarProvider } from "@/components/layout/WorkspaceSidebarProvider"
import { AppTopbar } from "@/components/layout/AppTopbar"
import { AppSidebar, DashboardIcon as Icon } from "@/components/ui/app-sidebar"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { peopleOrganizations, useSession } from "@/lib/auth"
import { myEvaluationsApi, type EntryRef, type EvaluationPeriod, type MyEvaluationBrief } from "@/lib/evaluations"
import { openNotifications, timeAgo, toneOf, useNotifications } from "@/lib/notifications"
import { useIdentity } from "@/lib/profile"
import { dayLabel, daysUntil, tbilisiToday, type EvaluationLinkState } from "@/Pages/EvaluationForm/evaluation-model"
import "./HomePage.css"

type QueueRow = { organization_id: string; period: EvaluationPeriod; sent: number; submitted: number; to_review: number }
type Tone = "warning" | "danger" | "success" | "info"

const pts = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)} pts`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function greeting() {
  const hour = new Date().getHours()
  return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
}

function Card({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`dashboard-card ${className}`}><div className="card-heading"><h2>{title}</h2>{action}</div>{children}</section>
}

function Progress({ value, label, warning = false }: { value: number; label: string; warning?: boolean }) {
  const shown = Math.max(0, Math.min(100, value))
  return <div className={`dashboard-progress ${warning ? "warning" : ""}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(shown)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${shown}%` }} /></div>
}

const toneIcons: Record<string, string> = { danger: "imgIconAlert2", warning: "imgIconClock", success: "imgIconCheck", info: "imgIconMail", brand: "imgIconFile1" }

/** The newest three notifications; the bell has the rest */
function NotificationList() {
  const { items, loaded } = useNotifications()
  if (loaded && items.length === 0) return <p className="dashboard-muted">No notifications yet. Forms sent to you, review decisions and deadline reminders appear here.</p>
  return <div className="notification-list">{items.slice(0, 3).map(item => {
    const tone = toneOf[item.kind] ?? "info"
    return <div className="notification-row" key={item.id}><span className={`icon-tile ${tone}`}><Icon name={toneIcons[tone]} /></span><div><p>{item.title}{!item.read && <span className="notification-unread" aria-label="Unread" />}</p><small>{timeAgo(item.at)}</small></div></div>
  })}</div>
}

/** What the evaluation's state means for the person, in one line: status label, banner and its tone */
function describe(evaluation: MyEvaluationBrief) {
  const { period } = evaluation
  const deadline = dayLabel(period.ends_on)
  const submitted = evaluation.submitted_at !== null
  if (evaluation.review_state === "approved") {
    return { status: "Approved", tone: "success" as Tone, title: `Your evaluation was approved: final score ${pts(evaluation.final_score ?? 0)}`, detail: `${period.name}. Only approved entries count towards the final score.`, action: "View form" }
  }
  if (period.status === "upcoming") {
    return { status: "Not open yet", tone: "info" as Tone, title: `${period.name} opens on ${dayLabel(period.starts_on)}`, detail: `You can fill in and submit your form from then until ${deadline}.`, action: "Have a look" }
  }
  if (period.status === "closed") {
    return submitted
      ? { status: evaluation.review_state === "returned" ? "Returned" : "Submitted", tone: "info" as Tone, title: `${period.name} has ended`, detail: evaluation.review_state === "returned" ? `Your form was returned: “${evaluation.review_comment}” Contact your coordinator about what happens next.` : "Your form is submitted and waits for your coordinator's review.", action: "View form" }
      : { status: "Not submitted", tone: "danger" as Tone, title: `${period.name} has ended`, detail: "Your form wasn't submitted before the deadline. Contact your coordinator if something needs to change.", action: "View form" }
  }
  if (evaluation.review_state === "returned" && evaluation.state === "submitted") {
    return { status: "Returned", tone: "danger" as Tone, title: "Your coordinator returned your form", detail: `“${evaluation.review_comment}” Fix it and resubmit it before ${deadline}.`, action: "Fix it" }
  }
  if (evaluation.state === "updating") {
    return { status: "Updating", tone: "warning" as Tone, title: "You're updating your submitted form", detail: `Your coordinator still sees the version you sent. Resubmit before ${deadline}.`, action: "Continue" }
  }
  if (submitted) {
    return { status: "Submitted", tone: "info" as Tone, title: `Submitted on ${new Date(evaluation.submitted_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}: waiting for review`, detail: `You can still update and resubmit it until ${deadline}.`, action: "View form" }
  }
  return { status: "Draft", tone: "warning" as Tone, title: `${period.name} is open: your form is still a draft`, detail: `Submit it before the end of ${deadline}.`, action: "Continue" }
}

/** The part of the period that has gone by, for the progress bar */
function elapsed(period: EvaluationPeriod) {
  const start = Date.parse(`${period.starts_on}T00:00:00Z`)
  const end = Date.parse(`${period.ends_on}T00:00:00Z`) + 86_400_000
  const now = Date.parse(`${tbilisiToday()}T12:00:00Z`)
  return end > start ? ((now - start) / (end - start)) * 100 : 100
}

export function HomePage() {
  const navigate = useNavigate()
  const session = useSession()
  const identity = useIdentity()
  const firstName = session?.name.split(/\s+/)[0] ?? ""
  const isStaff = session ? peopleOrganizations(session).length > 0 : false
  const [evaluations, setEvaluations] = useState<MyEvaluationBrief[] | null>(null)
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    myEvaluationsApi.list()
      .then(found => { if (!cancelled) setEvaluations(found) })
      .catch(() => { if (!cancelled) { setEvaluations([]); setLoadFailed(true) } })
    if (isStaff) api<QueueRow[]>("/me/review-queue").then(found => { if (!cancelled) setQueue(found) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [isStaff])

  /** Opens the evaluation form, with this entry's edit dialog open */
  const openEntry = (ref: EntryRef | null) => {
    const state: EvaluationLinkState | undefined = ref ? { edit: { recordId: ref.item_id, entryId: ref.entry_id } } : undefined
    navigate("/evaluation-form", { state })
  }
  const current = evaluations ? evaluations.find(item => item.period.status === "open") ?? evaluations[0] : undefined
  const state = current ? describe(current) : null
  const daysLeft = current ? daysUntil(current.period.ends_on) : 0
  const open = current?.period.status === "open"
  const editable = open && current?.review_state !== "approved" && current?.state !== "submitted"
  const shortfalls = current && editable ? current.parts.filter(part => part.min !== null && part.score < part.min) : []
  const toReview = queue.reduce((sum, row) => sum + row.to_review, 0)

  const attention: { tone: Tone; title: string; detail: string; label: string; onClick: () => void }[] = []
  if (current && current.review_state !== "approved") {
    if (current.review_state === "returned" && current.state === "submitted" && open) attention.push({ tone: "danger", title: "Your form was returned", detail: `“${current.review_comment}”`, label: "Fix it", onClick: () => navigate("/evaluation-form") })
    if (current.rejected > 0) attention.push({ tone: "danger", title: `${plural(current.rejected, "entry was", "entries were")} rejected`, detail: "Fix them and resubmit, or hide them if you'd rather not send them.", label: "Fix", onClick: () => openEntry(current.first_rejected) })
    if (current.missing_files > 0 && open) attention.push({ tone: "warning", title: `${plural(current.missing_files, "entry has", "entries have")} no evidence`, detail: "Attach a PDF or image, or your coordinator may reject them.", label: "Add file", onClick: () => openEntry(current.first_missing_file) })
    for (const part of shortfalls) attention.push({ tone: "warning", title: `${part.name}: ${pts(part.score)} of the ${part.min} needed`, detail: "Add more entries to this part before you submit.", label: "Add entries", onClick: () => navigate("/evaluation-form") })
    if (editable && daysLeft <= 7) attention.push({ tone: "warning", title: daysLeft === 0 ? "Today is the last day" : `${plural(daysLeft, "day")} left`, detail: `${current.state === "updating" ? "Resubmit" : "Submit"} your form before the end of ${dayLabel(current.period.ends_on)}.`, label: "Open form", onClick: () => navigate("/evaluation-form") })
  }
  if (toReview > 0) attention.push({ tone: "warning", title: `${plural(toReview, "form waits", "forms wait")} for your review`, detail: queue.filter(row => row.to_review).map(row => `${row.period.name}: ${row.to_review}`).join(" · "), label: "Review", onClick: () => navigate("/admin/evaluations") })

  return (
    <WorkspaceSidebarProvider>
      <AppSidebar onNavigate={() => undefined} />
      <main className="dashboard-main">
        <AppTopbar><span>Dashboard</span></AppTopbar>
        <div className="dashboard-content">
          <div className="page-heading"><div><h1>{greeting()}, {firstName}</h1><p>{[identity.department, identity.position, identity.faculty].filter(Boolean).join(" · ") || identity.organization}</p></div><Button variant="outline" className="dashboard-button" onClick={() => navigate("/cv-builder", { state: { download: true } })}><Icon name="imgIconDownload" />Download CV</Button></div>

          {evaluations === null ? <p role="status">Loading your evaluation…</p> : state && current ? <>
            <section className={`evaluation-banner tone-${state.tone}`}><Icon name={state.tone === "success" ? "imgIconCheck" : state.tone === "danger" ? "imgIconAlert1" : state.tone === "info" ? "imgIconClock" : "imgIconAlert"} /><div><p>{state.title}</p><small>{state.detail}</small></div><Button onClick={() => navigate("/evaluation-form")}>{state.action}</Button></section>
            <div className="dashboard-stats">
              <section className="stat-card"><div className="stat-heading"><h2>Evaluation status</h2><span className="icon-tile neutral"><Icon name="imgIconFile1" /></span></div><p className="stat-value">{state.status}</p><small>{current.form_name.en}</small></section>
              <section className="stat-card"><div className="stat-heading"><h2>Entries</h2><span className="icon-tile brand"><Icon name="imgIconChart" /></span></div><p className="stat-value">{current.entries}</p><small>{current.missing_files ? `${current.missing_files} without evidence` : current.entries ? "All with evidence" : "None added yet"}</small></section>
              <section className="stat-card"><div className="stat-heading"><h2>{current.review_state === "approved" ? "Final score" : "Score so far"}</h2><span className="icon-tile warning"><Icon name="imgIconStar" /></span></div><p className="stat-value">{pts(current.review_state === "approved" ? current.final_score ?? 0 : current.score)}</p><small>{current.total_minimum !== null ? `At least ${current.total_minimum} needed` : "Counted after approval"}</small></section>
              <section className="stat-card"><div className="stat-heading"><h2>Time left</h2><span className="icon-tile danger"><Icon name="imgIconClock" /></span></div><p className="stat-value">{current.period.status === "closed" ? "Closed" : current.period.status === "upcoming" ? "Not open" : daysLeft === 0 ? "Last day" : plural(daysLeft, "day")}</p><small>Deadline {dayLabel(current.period.ends_on)}{current.deadline_extended ? " (extended for you)" : ""}</small></section>
            </div>
          </> : (loadFailed || !isStaff) && (
            <section className="evaluation-banner tone-info"><Icon name="imgIconClock" /><div><p>{loadFailed ? "Your evaluation couldn't be loaded" : "No evaluation form yet"}</p><small>{loadFailed ? "Try again in a moment." : "Your coordinator sends it when an evaluation period starts. It appears here and under the bell."}</small></div></section>
          )}

          <div className="dashboard-columns">
            <div className="dashboard-stack">
              {current && (
                <Card title="Evaluation progress" action={<Button variant="ghost" className="soft-button" onClick={() => navigate("/evaluation-form")}>Open form<Icon name="imgIconChevR" /></Button>}>
                  <div className="progress-list">{current.parts.map(part => {
                    const target = part.min ?? part.cap
                    return <div key={part.id}>
                      <div className="progress-label"><span>{[part.numeral, part.name].filter(Boolean).join(". ")}</span><small>{pts(part.score)}{part.min !== null ? ` of at least ${part.min}` : part.cap !== null ? ` (counts up to ${part.cap})` : ""}</small></div>
                      {target ? <Progress value={(part.score / target) * 100} label={part.name} warning={part.min !== null && part.score < part.min} /> : null}
                    </div>
                  })}</div>
                </Card>
              )}
              <Card title="Needs your attention">
                {attention.length === 0
                  ? <p className="dashboard-muted">Nothing needs your attention right now.</p>
                  : <div className="attention-list">{attention.map(item => (
                    <div key={item.title} className={`attention-row ${item.tone}`}><Icon name={item.tone === "danger" ? "imgIconAlert1" : "imgIconClock1"} /><div><p>{item.title}</p><small>{item.detail}</small></div><Button variant="outline" className={item.tone === "danger" ? "danger-button" : undefined} onClick={item.onClick}>{item.label}</Button></div>
                  ))}</div>}
              </Card>
            </div>
            <div className="dashboard-stack">
              {current && (
                <Card title="Evaluation period"><div className="period-content">
                  <div className="period-title"><span className={`open-badge status-${current.period.status}`}><Icon name="imgDot" />{current.period.status === "open" ? "Open" : current.period.status === "upcoming" ? "Upcoming" : "Closed"}</span><span>{current.period.name}</span></div>
                  <small>Opens {dayLabel(current.period.starts_on)} · Closes {dayLabel(current.period.ends_on)}{current.deadline_extended ? " (extended for you)" : ""} · publications from {current.period.publication_from === current.period.publication_to ? current.period.publication_from : `${current.period.publication_from}–${current.period.publication_to}`}</small>
                  {current.period.status === "open" && <Progress warning value={elapsed(current.period)} label="Evaluation period elapsed" />}
                  <Button className="dashboard-button w-full" onClick={() => navigate("/evaluation-form")}><Icon name="imgIconFile2" />{editable ? "Continue evaluation" : "Open evaluation form"}</Button>
                </div></Card>
              )}
              {isStaff && (
                <Card title="To review" action={<button className="text-action" onClick={() => navigate("/admin/evaluations")}>Evaluations</button>}>
                  {queue.length === 0
                    ? <p className="dashboard-muted">No forms sent for an open period yet.</p>
                    : <div className="progress-list">{queue.map(row => (
                      <div key={`${row.organization_id}-${row.period.id}`}>
                        <div className="progress-label"><span>{row.period.name}</span><small>{row.submitted} of {row.sent} submitted{row.to_review ? ` · ${row.to_review} to review` : ""}</small></div>
                        <Progress value={row.sent ? (row.submitted / row.sent) * 100 : 0} label={`${row.period.name}: submitted`} />
                      </div>
                    ))}</div>}
                </Card>
              )}
              <Card title="Notifications" action={<button className="text-action" onClick={() => openNotifications(true)}>View all</button>}><NotificationList /></Card>
              <Card title="Quick actions" className="quick-actions">
                <Button variant="outline" className="dashboard-button w-full" onClick={() => navigate("/profile")}><Icon name="imgIconUser1" />Update my profile</Button>
                <Button variant="outline" className="dashboard-button w-full" onClick={() => navigate("/cv-builder")}><Icon name="imgIconBook1" />Build a CV</Button>
                <Button variant="outline" className="dashboard-button w-full" onClick={() => navigate("/evaluation-form")}><Icon name="imgIconFile1" />Evaluation form</Button>
              </Card>
            </div>
          </div>
        </div>
        <ContentScrollbar />
      </main>
    </WorkspaceSidebarProvider>
  )
}
