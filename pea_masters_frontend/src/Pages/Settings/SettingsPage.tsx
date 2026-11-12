import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { Navigate, useNavigate, useParams } from "react-router"
import { Bell, Check, Database, Download, Globe, Info, KeyRound, Lock, LogOut, Palette, Save, ShieldCheck, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import { Switch } from "@/components/forms/Switch"
import "@/components/forms/forms.css"
import { useLanguage } from "@/lib/language-context"
import { signOut } from "@/lib/auth"
import { useProfile } from "@/lib/profile"
import { applyDisplaySettings, loadSettings, saveSettings, type NotificationChannel, type NotificationEvent, type Settings } from "@/lib/settings"
import { themes, type ThemeId } from "@/lib/themes"
import { institutionalInformation as account } from "../Profile/profileMock"
import { initialSessions, passwordLastChanged, timeZones } from "./settingsMock"
import "./SettingsPage.css"

const sections = [
  { id: "account", label: "Account", icon: UserRound, description: "Your university account details." },
  { id: "security", label: "Password & security", icon: ShieldCheck, description: "Password, two-step verification and signed-in devices." },
  { id: "notifications", label: "Notifications", icon: Bell, description: "Choose what you hear about and where." },
  { id: "language", label: "Language & accessibility", icon: Globe, description: "Interface language, date format, time zone and motion." },
  { id: "customization", label: "Customization", icon: Palette, description: "Colour theme of the app." },
  { id: "privacy", label: "Privacy", icon: Lock, description: "Control who can see your public profile." },
  { id: "data", label: "Your data", icon: Database, description: "Download your data or sign out." },
] as const

type SectionId = (typeof sections)[number]["id"]

/** Sections whose fields are saved with the "Save changes" button in the page heading */
const preferenceSections: SectionId[] = ["notifications", "language", "customization", "privacy"]

const notificationEvents: { id: NotificationEvent; label: string; hint: string }[] = [
  { id: "deadlines", label: "Evaluation deadlines", hint: "Reminders before a submission period closes" },
  { id: "statusChanges", label: "Entry status changes", hint: "When an entry is approved, rejected or returned" },
  { id: "adminComments", label: "Comments from admins", hint: "When a faculty admin comments on your profile" },
  { id: "evaluationResults", label: "Evaluation results", hint: "When your evaluation result is published" },
  { id: "systemUpdates", label: "System announcements", hint: "Maintenance and new features" },
]

const channels: { id: NotificationChannel; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "inApp", label: "In-app" },
]

const dateFormats: Settings["dateFormat"][] = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]

function formatDate(date: Date, format: Settings["dateFormat"]) {
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = String(date.getFullYear())
  return format.replace("DD", dd).replace("MM", mm).replace("YYYY", yyyy)
}

function sameSettings(a: Settings, b: Settings) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** One labelled row with a control on the right (switch, select, ...) */
function SettingRow({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-text">
        <p id={`${id}-label`}>{label}</p>
        {hint && <small id={`${id}-hint`}>{hint}</small>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

function InfoBanner({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="info-banner">
      <Info aria-hidden="true" />
      <div><p>{title}</p><small>{children}</small></div>
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-readonly-field">
      <dt>{label}<Lock aria-label="Locked" /></dt>
      <dd>{value}</dd>
    </div>
  )
}

/** /settings/:sectionId */
export function SettingsPage() {
  const { sectionId } = useParams()
  const navigate = useNavigate()
  const { language, setLanguage } = useLanguage()

  const [saved, setSaved] = useState<Settings>(() => ({ ...loadSettings(), language }))
  const [draft, setDraft] = useState<Settings>(saved)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  // The top-bar language switch changes the language directly; keep this page in step
  const [seenLanguage, setSeenLanguage] = useState(language)
  if (seenLanguage !== language) {
    setSeenLanguage(language)
    setSaved(current => ({ ...current, language }))
    setDraft(current => ({ ...current, language }))
  }

  const dirty = !sameSettings(draft, saved)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // Preview the chosen colour theme across the app while it is still a draft...
  useEffect(() => { applyDisplaySettings({ ...saved, theme: draft.theme }) }, [draft.theme, saved])
  // ...and fall back to the saved one when leaving Settings without saving
  useEffect(() => () => applyDisplaySettings(loadSettings()), [])

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  // /settings with no section shows Account directly (redirecting would flash an empty frame)
  const section = sectionId === undefined ? sections[0] : sections.find(item => item.id === sectionId)
  if (!section) return <Navigate to="/settings/account" replace />

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
    setNotice(false)
  }

  const toggleNotification = (event: NotificationEvent, channel: NotificationChannel, value: boolean) => {
    setDraft(current => ({ ...current, notifications: { ...current.notifications, [event]: { ...current.notifications[event], [channel]: value } } }))
    setNotice(false)
  }

  const cancel = () => { setDraft(saved); setNotice(false) }

  const save = () => {
    setSaving(true)
    // TODO: replace with the API call once the back end exists
    timer.current = window.setTimeout(() => {
      saveSettings(draft)
      applyDisplaySettings(draft)
      if (draft.language !== language) {
        setSeenLanguage(draft.language)
        setLanguage(draft.language)
      }
      setSaved(draft)
      setSaving(false)
      setNotice(true)
      timer.current = window.setTimeout(() => setNotice(false), 4000)
    }, 500)
  }

  const showSaveActions = preferenceSections.includes(section.id)

  return (
    <WorkspaceLayout breadcrumb={[{ label: "Settings", to: "/settings/account" }, { label: section.label }]}>
      {() => (
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <h1>Settings</h1>
              <p>Manage your account, security and preferences.</p>
            </div>
            {showSaveActions && (
              <div className="page-actions settings-actions">
                <span className="save-status" role="status">{notice && !dirty && <><Check aria-hidden="true" />Changes saved</>}</span>
                <Button variant="outline" className="dashboard-button" disabled={!dirty || saving} onClick={cancel}>Cancel</Button>
                <Button className="dashboard-button" disabled={!dirty || saving} onClick={save}><Save />{saving ? "Saving…" : "Save changes"}</Button>
              </div>
            )}
          </div>

          <div className="settings-layout">
            <nav className="dashboard-card settings-nav" aria-label="Settings sections">
              <ul>
                {sections.map(item => {
                  const Icon = item.icon
                  return (
                    <li key={item.id}>
                      <button aria-current={item.id === section.id ? "page" : undefined} onClick={() => navigate(`/settings/${item.id}`)}>
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>

            <div className="settings-panels">
              {section.id === "account" && <AccountSection onEditProfile={() => navigate("/profile/general")} />}
              {section.id === "security" && <SecuritySection />}
              {section.id === "notifications" && (
                <NotificationsSection settings={draft} onToggle={toggleNotification} onChange={update} />
              )}
              {section.id === "language" && <LanguageSection settings={draft} onChange={update} />}
              {section.id === "customization" && <CustomizationSection theme={draft.theme} onChange={theme => update("theme", theme)} />}
              {section.id === "privacy" && <PrivacySection settings={draft} onChange={update} />}
              {section.id === "data" && <DataSection settings={saved} onSignOut={() => { void signOut(); navigate("/login", { replace: true }) }} />}
            </div>
          </div>
        </div>
      )}
    </WorkspaceLayout>
  )
}

/* ---------- Account ---------- */

function AccountSection({ onEditProfile }: { onEditProfile: () => void }) {
  const { photo } = useProfile()
  return (
    <>
      <section className="dashboard-card settings-card" aria-labelledby="account-heading">
        <div className="card-heading">
          <h2 id="account-heading">Account</h2>
          <Button variant="outline" className="dashboard-button settings-small-button" onClick={onEditProfile}>Edit public profile</Button>
        </div>
        <div className="settings-account">
          <div className="settings-account-avatar" aria-hidden="true">{photo ? <img src={photo} alt="" /> : account.initials}</div>
          <div>
            <p className="settings-account-name">{account.fullName}</p>
            <small>{account.position} · {account.faculty}</small>
          </div>
        </div>
        <dl className="settings-readonly-grid">
          <ReadOnlyField label="Full name" value={account.fullName} />
          <ReadOnlyField label="University email" value={account.email} />
          <ReadOnlyField label="Faculty / School" value={account.faculty} />
          <ReadOnlyField label="Academic position" value={account.position} />
        </dl>
        <InfoBanner title="Managed by Ilia State University">
          Your name, email and position come from the university directory. To change them, contact your faculty admin.
        </InfoBanner>
      </section>
    </>
  )
}

/* ---------- Password & security ---------- */

const PASSWORD_MIN_LENGTH = 10

function passwordProblems(current: string, next: string, confirm: string) {
  const errors: Partial<Record<"current" | "next" | "confirm", string>> = {}
  if (!current) errors.current = "Enter your current password."
  if (next.length < PASSWORD_MIN_LENGTH) errors.next = `Use at least ${PASSWORD_MIN_LENGTH} characters.`
  else if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) errors.next = "Use at least one letter and one number."
  else if (next === current) errors.next = "Choose a password you haven't used here."
  if (confirm !== next) errors.confirm = "Passwords don't match."
  return errors
}

function SecuritySection() {
  const [fields, setFields] = useState({ current: "", next: "", confirm: "" })
  const [errors, setErrors] = useState<ReturnType<typeof passwordProblems>>({})
  const [submitting, setSubmitting] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState(false)
  const [lastChanged, setLastChanged] = useState(passwordLastChanged)

  const [twoFactor, setTwoFactor] = useState(false)
  const [sessions, setSessions] = useState(initialSessions)

  const setField = (key: keyof typeof fields, value: string) => {
    setFields(current => ({ ...current, [key]: value }))
    setErrors(current => ({ ...current, [key]: undefined }))
    setPasswordNotice(false)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const problems = passwordProblems(fields.current, fields.next, fields.confirm)
    setErrors(problems)
    if (Object.keys(problems).length > 0) return
    setSubmitting(true)
    // TODO: replace with the API call once the back end exists
    window.setTimeout(() => {
      setSubmitting(false)
      setFields({ current: "", next: "", confirm: "" })
      setPasswordNotice(true)
      setLastChanged(new Date().toISOString().slice(0, 10))
    }, 600)
  }

  const lastChangedLabel = new Date(lastChanged).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  const otherSessions = sessions.filter(session => !session.current)

  const passwordField = (key: keyof typeof fields, label: string, autoComplete: string, hint?: string) => {
    const id = `password-${key}`
    const error = errors[key]
    const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined
    return (
      <div className="form-field span-4">
        <label htmlFor={id}>{label}</label>
        <input id={id} type="password" className="form-control" autoComplete={autoComplete} value={fields[key]} aria-invalid={error ? true : undefined} aria-describedby={describedBy} onChange={e => setField(key, e.target.value)} />
        {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
        {error && <p id={`${id}-error`} className="field-error">{error}</p>}
      </div>
    )
  }

  return (
    <>
      <section className="dashboard-card settings-card" aria-labelledby="password-heading">
        <div className="card-heading">
          <h2 id="password-heading">Change password</h2>
          <span className="card-meta">Last changed {lastChangedLabel}</span>
        </div>
        <form className="settings-password-form" onSubmit={submit} noValidate>
          <div className="form-grid">
            {passwordField("current", "Current password", "current-password")}
            {passwordField("next", "New password", "new-password", `At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`)}
            {passwordField("confirm", "Confirm new password", "new-password")}
          </div>
          <div className="settings-form-actions">
            <span className="save-status" role="status">{passwordNotice && <><Check aria-hidden="true" />Password updated</>}</span>
            <Button type="submit" className="dashboard-button" disabled={submitting}><KeyRound />{submitting ? "Updating…" : "Update password"}</Button>
          </div>
        </form>
      </section>

      <section className="dashboard-card settings-card" aria-labelledby="twofactor-heading">
        <div className="card-heading"><h2 id="twofactor-heading">Two-step verification</h2></div>
        <SettingRow id="two-factor" label="Require a code when signing in" hint="After your password, enter a 6-digit code from an authenticator app.">
          <Switch checked={twoFactor} onChange={setTwoFactor} labelledBy="two-factor-label" describedBy="two-factor-hint" />
        </SettingRow>
        {twoFactor && (
          <InfoBanner title="Two-step verification is on">
            Next time you sign in you'll be asked to scan a QR code with your authenticator app.
          </InfoBanner>
        )}
      </section>

      <section className="dashboard-card settings-card" aria-labelledby="sessions-heading">
        <div className="card-heading">
          <h2 id="sessions-heading">Where you're signed in</h2>
          <Button variant="outline" className="dashboard-button settings-small-button" disabled={otherSessions.length === 0} onClick={() => setSessions(current => current.filter(session => session.current))}>
            <LogOut />Sign out of other devices
          </Button>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr><th scope="col">Device</th><th scope="col">Location</th><th scope="col">Last active</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {sessions.map(session => (
                <tr key={session.id}>
                  <td>{session.device}</td>
                  <td>{session.location}</td>
                  <td>{session.current ? <span className="status-badge status-active">This device</span> : session.lastActive}</td>
                  <td className="settings-table-action">
                    {!session.current && (
                      <Button variant="ghost" className="text-action" onClick={() => setSessions(current => current.filter(item => item.id !== session.id))} aria-label={`Sign out ${session.device}`}>
                        Sign out
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

/* ---------- Notifications ---------- */

function NotificationsSection({ settings, onToggle, onChange }: {
  settings: Settings
  onToggle: (event: NotificationEvent, channel: NotificationChannel, value: boolean) => void
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}) {
  return (
    <>
      <section className="dashboard-card settings-card" aria-labelledby="notify-heading">
        <div className="card-heading">
          <h2 id="notify-heading">Notifications</h2>
          <span className="card-meta">Email goes to {account.email}</span>
        </div>
        <div className="data-table-wrap">
          <table className="data-table settings-notify-table">
            <thead>
              <tr>
                <th scope="col">Notify me about</th>
                {channels.map(channel => <th key={channel.id} scope="col" className="settings-check-col">{channel.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {notificationEvents.map(event => (
                <tr key={event.id}>
                  <td>
                    <p className="settings-event-label">{event.label}</p>
                    <small className="settings-event-hint">{event.hint}</small>
                  </td>
                  {channels.map(channel => (
                    <td key={channel.id} className="settings-check-col">
                      <input
                        type="checkbox"
                        className="form-checkbox"
                        checked={settings.notifications[event.id][channel.id]}
                        aria-label={`${event.label}: ${channel.label}`}
                        onChange={e => onToggle(event.id, channel.id, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-card settings-card" aria-labelledby="timing-heading">
        <div className="card-heading"><h2 id="timing-heading">Timing</h2></div>
        <SettingRow id="lead" label="Deadline reminders" hint="How early to remind you before a deadline.">
          <select className="form-control settings-select" aria-labelledby="lead-label" aria-describedby="lead-hint" value={settings.reminderLeadDays} onChange={e => onChange("reminderLeadDays", e.target.value as Settings["reminderLeadDays"])}>
            <option value="1">1 day before</option>
            <option value="3">3 days before</option>
            <option value="7">1 week before</option>
            <option value="14">2 weeks before</option>
          </select>
        </SettingRow>
        <SettingRow id="digest" label="Email summary" hint="One email that collects everything you missed.">
          <select className="form-control settings-select" aria-labelledby="digest-label" aria-describedby="digest-hint" value={settings.digest} onChange={e => onChange("digest", e.target.value as Settings["digest"])}>
            <option value="off">Off</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </SettingRow>
      </section>
    </>
  )
}

/* ---------- Language & accessibility ---------- */

function LanguageSection({ settings, onChange }: { settings: Settings; onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void }) {
  const today = new Date()
  return (
    <>
      <section className="dashboard-card settings-card" aria-labelledby="language-heading">
        <div className="card-heading"><h2 id="language-heading">Language &amp; region</h2></div>
        <SettingRow id="language" label="Interface language" hint="Also the language you enter profile content in. You can switch it in the top bar too.">
          <select className="form-control settings-select" aria-labelledby="language-label" aria-describedby="language-hint" value={settings.language} onChange={e => onChange("language", e.target.value as Settings["language"])}>
            <option value="EN">English</option>
            <option value="KA" lang="ka">ქართული (Georgian)</option>
          </select>
        </SettingRow>
        <SettingRow id="date-format" label="Date format" hint={`Today would be shown as ${formatDate(today, settings.dateFormat)}.`}>
          <select className="form-control settings-select" aria-labelledby="date-format-label" aria-describedby="date-format-hint" value={settings.dateFormat} onChange={e => onChange("dateFormat", e.target.value as Settings["dateFormat"])}>
            {dateFormats.map(format => <option key={format} value={format}>{format}</option>)}
          </select>
        </SettingRow>
        <SettingRow id="time-zone" label="Time zone" hint="Used for deadlines and reminders.">
          <select className="form-control settings-select" aria-labelledby="time-zone-label" aria-describedby="time-zone-hint" value={settings.timeZone} onChange={e => onChange("timeZone", e.target.value)}>
            {timeZones.map(zone => <option key={zone} value={zone}>{zone.replace("_", " ")}</option>)}
          </select>
        </SettingRow>
      </section>

      <section className="dashboard-card settings-card" aria-labelledby="accessibility-heading">
        <div className="card-heading"><h2 id="accessibility-heading">Accessibility</h2></div>
        <SettingRow id="reduce-motion" label="Reduce motion" hint="Turn off animations and sliding panels.">
          <Switch checked={settings.reduceMotion} onChange={value => onChange("reduceMotion", value)} labelledBy="reduce-motion-label" describedBy="reduce-motion-hint" />
        </SettingRow>
      </section>
    </>
  )
}

/* ---------- Customization ---------- */

function CustomizationSection({ theme, onChange }: { theme: ThemeId; onChange: (theme: ThemeId) => void }) {
  return (
    <section className="dashboard-card settings-card" aria-labelledby="theme-heading">
      <div className="card-heading"><h2 id="theme-heading">Colour theme</h2></div>
      <p className="settings-card-intro" id="theme-hint">Pick a theme to preview it across the app, then save changes to keep it.</p>
      <div className="theme-grid" role="radiogroup" aria-labelledby="theme-heading" aria-describedby="theme-hint">
        {themes.map(option => {
          const selected = option.id === theme
          return (
            <label key={option.id} className="theme-option">
              <input type="radio" name="theme" value={option.id} checked={selected} onChange={() => onChange(option.id)} className="sr-only" />
              <span className="theme-swatches" aria-hidden="true">
                {option.swatches.map(swatch => <span key={swatch.name} style={{ background: swatch.hex }} title={`${swatch.name} ${swatch.hex}`} />)}
              </span>
              <span className="theme-option-body">
                <span className="theme-option-title">
                  <span>{option.name}</span>
                  <span className="theme-mode">{option.mode === "dark" ? "Dark" : "Light"}</span>
                  {selected && <Check className="theme-selected" aria-hidden="true" />}
                </span>
                <small>{option.description}</small>
              </span>
            </label>
          )
        })}
      </div>
    </section>
  )
}

/* ---------- Privacy ---------- */

const visibilityOptions: { value: Settings["profileVisibility"]; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Anyone with the link, including people outside the university." },
  { value: "university", label: "University only", hint: "Only signed-in Ilia State University staff and students." },
  { value: "private", label: "Private", hint: "Only you and the admins who evaluate you." },
]

function PrivacySection({ settings, onChange }: { settings: Settings; onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void }) {
  const hidden = settings.profileVisibility === "private"
  return (
    <>
      <section className="dashboard-card settings-card" aria-labelledby="visibility-heading">
        <div className="card-heading"><h2 id="visibility-heading">Public profile visibility</h2></div>
        <div className="settings-radio-group" role="radiogroup" aria-labelledby="visibility-heading">
          {visibilityOptions.map(option => (
            <label key={option.value} className="settings-radio">
              <input type="radio" name="profile-visibility" value={option.value} checked={settings.profileVisibility === option.value} onChange={() => onChange("profileVisibility", option.value)} />
              <span>
                <span className="settings-radio-label">{option.label}</span>
                <small>{option.hint}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="dashboard-card settings-card" aria-labelledby="shown-heading">
        <div className="card-heading"><h2 id="shown-heading">What your profile shows</h2></div>
        <SettingRow id="show-email" label="Show my email address" hint="Visitors can contact you directly.">
          <Switch checked={settings.showEmail} onChange={value => onChange("showEmail", value)} labelledBy="show-email-label" describedBy="show-email-hint" disabled={hidden} />
        </SettingRow>
        <SettingRow id="show-photo" label="Show my photo" hint="Otherwise your initials are shown.">
          <Switch checked={settings.showPhoto} onChange={value => onChange("showPhoto", value)} labelledBy="show-photo-label" describedBy="show-photo-hint" disabled={hidden} />
        </SettingRow>
        <SettingRow id="indexing" label="Let search engines find my profile" hint="Your profile can appear in Google and other search results.">
          <Switch checked={settings.searchIndexing && settings.profileVisibility === "public"} onChange={value => onChange("searchIndexing", value)} labelledBy="indexing-label" describedBy="indexing-hint" disabled={settings.profileVisibility !== "public"} />
        </SettingRow>
        {hidden && (
          <InfoBanner title="Your profile is private">
            These options apply again when you make your profile visible.
          </InfoBanner>
        )}
      </section>
    </>
  )
}

/* ---------- Your data ---------- */

function DataSection({ settings, onSignOut }: { settings: Settings; onSignOut: () => void }) {
  const download = () => {
    const data = { exportedAt: new Date().toISOString(), account, settings }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "pea-my-data.json"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <section className="dashboard-card settings-card" aria-labelledby="export-heading">
        <div className="card-heading"><h2 id="export-heading">Download your data</h2></div>
        <SettingRow id="export" label="Export a copy" hint="Your account details and settings as a JSON file.">
          <Button variant="outline" className="dashboard-button" onClick={download}><Download />Download</Button>
        </SettingRow>
      </section>

      <section className="dashboard-card settings-card" aria-labelledby="session-heading">
        <div className="card-heading"><h2 id="session-heading">Sign out</h2></div>
        <SettingRow id="sign-out" label="Sign out on this device" hint="You'll need your university email and password to sign in again.">
          <Button variant="outline" className="dashboard-button" onClick={onSignOut}><LogOut />Sign out</Button>
        </SettingRow>
      </section>

      <section className="dashboard-card settings-card" aria-labelledby="close-heading">
        <div className="card-heading"><h2 id="close-heading">Close account</h2></div>
        <InfoBanner title="Accounts are managed by Ilia State University">
          Your account is closed automatically when you leave the university. To close it sooner, contact your faculty admin.
        </InfoBanner>
      </section>
    </>
  )
}
