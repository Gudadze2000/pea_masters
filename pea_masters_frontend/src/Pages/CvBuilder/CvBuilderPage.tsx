import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { flushSync } from "react-dom"
import { useBlocker, useLocation, useNavigate } from "react-router"
import { TriangleAlert, Check, Eye, EyeOff, Globe, Lock, Printer, Save, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import { useQualifications } from "@/Pages/Profile/qualifications/qualifications-store"
import { saveIdentifiers, useIdentity, useMyProfile } from "@/lib/profile"
import { SERVER_IDENTIFIERS } from "@/Pages/Profile/sections/IdentifiersCard"
import { savedResearch, useProfileData } from "@/Pages/Profile/profile-data"
import { useStore } from "@/lib/store"
import { buildCvSections, sectionCounts } from "./cv-content"
import { browserCv, cvApi, forgetBrowserCv, initialCv, normaliseCv, type CvData, type Visibility } from "./cv-model"
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
  const { profile } = useMyProfile()
  useProfileData()
  const research = useStore(savedResearch)
  const { entries } = useQualifications()
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")
  const [cv, setCv] = useState<CvData>(initialCv)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "failed">("idle")
  /** The CV as last saved on the server, to tell whether there are unsaved changes */
  const [savedCv, setSavedCv] = useState<CvData>(initialCv)
  const [tab, setTab] = useState<TabId>("profile")
  const [previewMode, setPreviewMode] = useState<PreviewMode>("owner")
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit")
  const [confirmPublic, setConfirmPublic] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const now = useNow(30000)

  // ORCID, ResearcherID and Scopus ID live on the profile (server); the CV shows those
  const shown = useMemo<CvData>(() => profile ? {
    ...cv,
    profiles: { ...cv.profiles, ...Object.fromEntries(SERVER_IDENTIFIERS.map(({ key, server }) => [key, profile.identifiers[server] ?? ""])) },
  } : cv, [cv, profile])

  // IDs typed into the CV builder before they moved to the profile: move them over once
  const moved = useRef(false)
  useEffect(() => {
    if (!profile || moved.current) return
    moved.current = true
    const local = Object.fromEntries(SERVER_IDENTIFIERS
      .filter(({ key, server }) => cv.profiles[key] && !profile.identifiers[server])
      .map(({ key, server }) => [server, cv.profiles[key]]))
    if (Object.keys(local).length) void saveIdentifiers(local).catch(() => { /* invalid or offline: they stay in the CV builder */ })
  }, [profile, cv.profiles])

  /* ---------- load, and autosave to the server ---------- */

  const dirty = useMemo(() => JSON.stringify(cv) !== JSON.stringify(savedCv), [cv, savedCv])

  /** Saves the CV as it is now (the Save button, or Ctrl+S) */
  const save = async () => {
    if (saveState === "saving") return
    const snapshot = cv
    setSaveState("saving")
    try {
      const saved = await cvApi.save(snapshot)
      setSavedCv(snapshot)
      setSavedAt(Date.parse(saved.updated_at))
      setSaveState("idle")
    } catch {
      setSaveState("failed")
    }
  }

  const load = async () => {
    setLoadState("loading")
    try {
      const stored = await cvApi.get()
      const fromServer = stored.data ? normaliseCv(stored.data) : null
      const fromBrowser = fromServer ? null : browserCv()
      const data = fromServer ?? fromBrowser ?? initialCv
      setCv(data)
      setSavedCv(fromBrowser ? initialCv : data)  // a browser copy counts as unsaved until it reaches the server
      setSavedAt(stored.updated_at ? Date.parse(stored.updated_at) : null)
      setLoadState("ready")
      if (fromBrowser) {
        // A CV this browser kept before CVs moved to the server: move it over once, then forget the browser copy
        await cvApi.save(fromBrowser).then(saved => { setSavedCv(fromBrowser); setSavedAt(Date.parse(saved.updated_at)); forgetBrowserCv(); flash("Your CV from this browser is now saved on the server.") })
          .catch(() => setSaveState("failed"))
      }
    } catch {
      setLoadState("error")
    }
  }

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const change: ChangeCv = update => {
    setCv(update)
    if (saveState === "failed") setSaveState("idle")
  }

  // Unsaved changes: the browser asks before closing the tab or reloading...
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  // ...and PEA asks before going to another page
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)

  // Ctrl+S / ⌘S saves the CV instead of opening the browser's "save page" dialog
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

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
  const sections = useMemo(() => buildCvSections(cv, entries, { asVisitor, ownFamilyName: person.familyName, research }), [cv, entries, asVisitor, person.familyName, research])
  const counts = useMemo(() => sectionCounts(cv, entries, research), [cv, entries, research])

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

  const saveText = saveState === "saving" ? "Saving…"
    : saveState === "failed" ? "Not saved"
      : dirty ? "Unsaved changes"
        : savedAt ? `Saved · ${timeAgo(savedAt, now)}` : "Not saved yet"

  return (
    <WorkspaceLayout breadcrumb={[{ label: "CV builder" }]}>
      {() => loadState !== "ready" ? (
        <div className="dashboard-content">
          <div className="page-heading"><div><h1>CV builder</h1></div></div>
          <div className="dashboard-card" role={loadState === "error" ? "alert" : "status"}>
            {loadState === "error" ? <>Your CV couldn't be loaded. <Button variant="link" onClick={() => void load()}>Try again</Button></> : "Loading your CV…"}
          </div>
        </div>
      ) : (
        <div className="dashboard-content cv-builder" data-view={mobileView}>
          <div className="page-heading cv-no-print">
            <div>
              <h1>CV builder <span className={`cv-visibility-pill ${cv.visibility}`}>{cv.visibility === "public" ? <Globe aria-hidden="true" /> : <Lock aria-hidden="true" />}{cv.visibility === "public" ? "Public" : "Private"}</span></h1>
              <p>Build an academic CV from your profile, publications and research links.</p>
            </div>
            <div className="page-actions">
              <span className={`cv-save-status ${saveState === "failed" ? "failed" : dirty ? "unsaved" : ""}`} role="status">
                {saveState === "failed" ? <TriangleAlert aria-hidden="true" /> : !dirty && saveState === "idle" && savedAt ? <Check aria-hidden="true" /> : null}
                {saveText}
              </span>
              <Button className="dashboard-button" disabled={!dirty || saveState === "saving"} onClick={() => void save()} title="Save (Ctrl+S)">
                <Save />{saveState === "saving" ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" className="dashboard-button" onClick={downloadPdf}><Printer />Download PDF</Button>
            </div>
          </div>

          {saveState === "failed" && (
            <div className="cv-warning cv-no-print" role="alert">
              <TriangleAlert aria-hidden="true" />
              <div><p>Your latest changes couldn't be saved</p><small>Check your connection and try again. Until then, “Export backup” in Sections &amp; layout keeps a copy on your computer.</small></div>
              <Button variant="outline" className="dashboard-button compact" onClick={() => void save()}>Try again</Button>
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
                  <CvPreview cv={shown} sections={sections} person={person} asVisitor={asVisitor} />
                </div>
              )}
            </aside>
          </div>

          <ConfirmDialog
            open={blocker.state === "blocked"}
            title="Leave without saving?"
            description="Your CV has changes that aren't saved yet. If you leave now, they're lost."
            confirmLabel="Leave without saving"
            cancelLabel="Stay on this page"
            danger
            onConfirm={() => blocker.proceed?.()}
            onCancel={() => blocker.reset?.()}
          />
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
