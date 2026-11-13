import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { flushSync } from "react-dom"
import { useLocation, useNavigate } from "react-router"
import { TriangleAlert, Check, Eye, EyeOff, Globe, Lock, Printer, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import { useQualifications } from "@/Pages/Profile/qualifications/qualifications-store"
import { useIdentity } from "@/lib/profile"
import { buildCvSections, sectionCounts } from "./cv-content"
import { loadCv, saveCv, type CvData, type Visibility } from "./cv-model"
import { ConfirmDialog, Segmented } from "./cv-ui"
import type { ChangeCv } from "./form-utils"
import { CvPreview } from "./CvPreview"
import { LayoutTab } from "./LayoutTab"
import { ProfileTab } from "./ProfileTab"
import { PublicationsTab } from "./PublicationsTab"
import { TalksTab } from "./TalksTab"
import "@/components/forms/forms.css"
import "@/Pages/Profile/qualifications/QualificationsPage.css"
import "@/Pages/Profile/research/ResearchPage.css"
import "./CvBuilderPage.css"

const AUTOSAVE_DELAY = 800

const TABS = [
  { id: "profile", label: "Profile & links" },
  { id: "publications", label: "Publications" },
  { id: "talks", label: "Talks" },
  { id: "layout", label: "Sections & layout" },
] as const
type TabId = typeof TABS[number]["id"]

type PreviewMode = "owner" | "visitor"

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

function timeAgo(timestamp: number, now: number) {
  const minutes = Math.floor((now - timestamp) / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}


/** /cv-builder */
export function CvBuilderPage() {
  const person = useIdentity()
  const { entries } = useQualifications()
  const [initial] = useState(loadCv)
  const [cv, setCv] = useState<CvData>(initial.data)
  const [savedAt, setSavedAt] = useState<number | null>(initial.savedAt)
  const [saveState, setSaveState] = useState<"idle" | "pending" | "failed">("idle")
  const [tab, setTab] = useState<TabId>("profile")
  const [previewMode, setPreviewMode] = useState<PreviewMode>("owner")
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit")
  const [confirmPublic, setConfirmPublic] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const latest = useRef(cv)
  const timer = useRef<number | undefined>(undefined)
  const noticeTimer = useRef<number | undefined>(undefined)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const now = useNow(30000)

  /* ---------- autosave to this browser ---------- */

  const persist = (data: CvData) => {
    window.clearTimeout(timer.current)
    const at = Date.now()
    if (saveCv(data, at)) {
      setSavedAt(at)
      setSaveState("idle")
    } else {
      setSaveState("failed")
    }
  }

  const change: ChangeCv = update => {
    setCv(current => {
      const next = update(current)
      latest.current = next
      return next
    })
    setSaveState("pending")
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => persist(latest.current), AUTOSAVE_DELAY)
  }

  // Save straight away when the page is closed or left, so the last keystrokes aren't lost
  useEffect(() => {
    const flush = () => { if (timer.current !== undefined) saveCv(latest.current, Date.now()) }
    window.addEventListener("pagehide", flush)
    return () => {
      window.removeEventListener("pagehide", flush)
      flush()
      window.clearTimeout(timer.current)
      window.clearTimeout(noticeTimer.current)
    }
  }, [])

  const flash = (message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5000)
  }

  const setVisibility = (visibility: Visibility) => {
    if (visibility === cv.visibility) return
    if (visibility === "public") return setConfirmPublic(true)
    change(current => ({ ...current, visibility: "private" }))
    flash("Your CV is private. It no longer appears on your public profile.")
  }

  /* ---------- preview ---------- */

  const asVisitor = previewMode === "visitor"
  const sections = useMemo(() => buildCvSections(cv, entries, { asVisitor, ownFamilyName: person.familyName }), [cv, entries, asVisitor, person.familyName])
  const counts = useMemo(() => sectionCounts(cv, entries), [cv, entries])

  // The PDF is always the full CV, whatever preview mode is selected
  const downloadPdf = () => {
    flushSync(() => setPreviewMode("owner"))
    window.print()
  }

  // "Download CV" elsewhere (e.g. the dashboard) opens this page with { download: true }: print once the
  // web fonts are in, then drop the state so a reload or Back doesn't print again
  const location = useLocation()
  const navigate = useNavigate()
  const downloadRequested = useRef(false)
  useEffect(() => {
    if (downloadRequested.current || !(location.state as { download?: boolean } | null)?.download) return
    downloadRequested.current = true
    document.fonts.ready.then(() => requestAnimationFrame(() => {
      downloadPdf()
      navigate(location.pathname, { replace: true, state: null })
    }))
  })

  const onTabKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
    const target = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : step ? (index + step + TABS.length) % TABS.length : -1
    if (target < 0) return
    event.preventDefault()
    setTab(TABS[target].id)
    tabRefs.current[target]?.focus()
  }

  const saveText = saveState === "failed"
    ? "Couldn't save in this browser"
    : saveState === "pending" ? "Saving…"
      : savedAt ? `Saved in this browser · ${timeAgo(savedAt, now)}` : "Changes are saved in this browser"

  return (
    <WorkspaceLayout breadcrumb={[{ label: "CV builder" }]}>
      {() => (
        <div className="dashboard-content cv-builder" data-view={mobileView}>
          <div className="page-heading cv-no-print">
            <div>
              <h1>CV builder <span className={`cv-visibility-pill ${cv.visibility}`}>{cv.visibility === "public" ? <Globe aria-hidden="true" /> : <Lock aria-hidden="true" />}{cv.visibility === "public" ? "Public" : "Private"}</span></h1>
              <p>Build an academic CV from your profile, publications and research links.</p>
            </div>
            <div className="page-actions">
              <span className={`cv-save-status ${saveState === "failed" ? "failed" : ""}`} role="status">
                {saveState === "failed" ? <TriangleAlert aria-hidden="true" /> : saveState === "idle" && savedAt ? <Check aria-hidden="true" /> : null}
                {saveText}
              </span>
              <Button className="dashboard-button" onClick={downloadPdf}><Printer />Download PDF</Button>
            </div>
          </div>

          {saveState === "failed" && (
            <div className="cv-warning cv-no-print" role="alert">
              <TriangleAlert aria-hidden="true" />
              <div><p>Your browser isn't letting this page save</p><small>This happens in private windows or when site data is blocked. Use “Export backup” in Sections &amp; layout before you leave the page.</small></div>
            </div>
          )}

          <section className={`dashboard-card cv-visibility-card cv-no-print ${cv.visibility}`} aria-labelledby="cv-visibility-heading">
            <div className="cv-visibility-main">
              <span className="cv-visibility-icon" aria-hidden="true">{cv.visibility === "public" ? <Globe /> : <Lock />}</span>
              <div>
                <h2 id="cv-visibility-heading">Visibility on your profile</h2>
                <p>{cv.visibility === "public"
                  ? "Anyone who opens your public researcher profile can see and download this CV."
                  : "Only you can see this CV. It doesn't appear on your public researcher profile."}</p>
              </div>
              <Segmented<Visibility>
                label="CV visibility"
                className="cv-visibility-switch"
                value={cv.visibility}
                options={[{ value: "private", label: "Private", icon: Lock }, { value: "public", label: "Public", icon: Globe }]}
                onChange={setVisibility}
              />
            </div>
            {cv.visibility === "public" && (
              <fieldset className="cv-public-fields">
                <legend>Show visitors</legend>
                {([["email", `Email (${person.email})`], ["phone", "Phone number"], ["metrics", "Research metrics"]] as const).map(([key, label]) => (
                  <label key={key} className="cv-checkbox inline">
                    <input type="checkbox" checked={cv.publicFields[key]} onChange={e => change(current => ({ ...current, publicFields: { ...current.publicFields, [key]: e.target.checked } }))} />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <p className="section-notice" role="status">{notice && <><Check aria-hidden="true" />{notice}</>}</p>
          </section>

          <div className="cv-mobile-switch cv-no-print">
            <Segmented
              label="Show"
              value={mobileView}
              options={[{ value: "edit", label: "Edit" }, { value: "preview", label: "Preview" }]}
              onChange={setMobileView}
            />
          </div>

          <div className="cv-layout">
            <div className="cv-editor cv-no-print">
              <div className="cv-tabs" role="tablist" aria-label="CV sections">
                {TABS.map((item, index) => (
                  <button
                    key={item.id}
                    ref={element => { tabRefs.current[index] = element }}
                    id={`cv-tab-${item.id}`}
                    role="tab"
                    aria-selected={tab === item.id}
                    aria-controls={`cv-panel-${item.id}`}
                    tabIndex={tab === item.id ? 0 : -1}
                    onClick={() => setTab(item.id)}
                    onKeyDown={event => onTabKeyDown(event, index)}
                  >
                    {item.label}
                    {item.id === "publications" && <span className="count-badge">{cv.publications.length}</span>}
                    {item.id === "talks" && <span className="count-badge">{cv.talks.length}</span>}
                  </button>
                ))}
              </div>
              <div id={`cv-panel-${tab}`} role="tabpanel" aria-labelledby={`cv-tab-${tab}`}>
                {tab === "profile" && <ProfileTab cv={cv} change={change} />}
                {tab === "publications" && <PublicationsTab cv={cv} change={change} />}
                {tab === "talks" && <TalksTab cv={cv} change={change} />}
                {tab === "layout" && (
                  <LayoutTab
                    cv={cv}
                    change={change}
                    counts={counts}
                    replace={(next, message) => {
                      change(() => next)
                      flash(message)
                    }}
                  />
                )}
              </div>
            </div>

            <aside className="cv-preview-pane" aria-label="Preview">
              <div className="cv-preview-toolbar cv-no-print">
                <Segmented<PreviewMode>
                  label="Preview as"
                  value={previewMode}
                  options={[{ value: "owner", label: "My view", icon: UserRound }, { value: "visitor", label: "Visitor view", icon: Eye }]}
                  onChange={setPreviewMode}
                />
                <p className="cv-preview-caption">
                  {asVisitor
                    ? cv.visibility === "public" ? "What visitors to your profile see." : "Visitors don't see a CV section at all."
                    : cv.visibility === "public" ? "Visible on your public profile." : "Only you can see this."}
                </p>
              </div>
              {asVisitor && cv.visibility === "private" ? (
                <div className="empty-state cv-hidden-state">
                  <EyeOff aria-hidden="true" />
                  <p>Your CV is private</p>
                  <small>Your public profile shows no CV section, so visitors can't tell that one exists. Switch Visibility to Public to share it.</small>
                </div>
              ) : (
                <div className="cv-paper-scroll">
                  <CvPreview cv={cv} sections={sections} person={person} asVisitor={asVisitor} />
                </div>
              )}
            </aside>
          </div>

          <ConfirmDialog
            open={confirmPublic}
            title="Make your CV public?"
            description={
              <>
                Anyone who visits your researcher profile will be able to see and download your CV
                {cv.publicFields.email ? `, including your email address (${person.email})` : ""}
                {cv.publicFields.phone && cv.personal.phone ? " and phone number" : ""}. You can make it private again at any time.
              </>
            }
            confirmLabel="Make public"
            onCancel={() => setConfirmPublic(false)}
            onConfirm={() => {
              change(current => ({ ...current, visibility: "public" }))
              setConfirmPublic(false)
              flash("Your CV is public. It now appears on your researcher profile.")
            }}
          />
        </div>
      )}
    </WorkspaceLayout>
  )
}
