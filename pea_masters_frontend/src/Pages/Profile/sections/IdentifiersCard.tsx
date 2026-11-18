import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { BadgeCheck, Check, CircleCheck, ExternalLink, Link2, Save } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { CONNECT_ORCID_URL, disconnectOrcid, saveIdentifiers, type Identifiers, type MyProfile } from "@/lib/profile"
import { PROFILE_DEFS, type ProfileKey } from "@/Pages/CvBuilder/identifiers"
import "@/components/forms/forms.css"
import "../GeneralInformationPage.css"

/** The CV builder's profile keys and the server's names for the same identifiers */
export const SERVER_IDENTIFIERS: { key: ProfileKey; server: keyof Identifiers; use: string }[] = [
  { key: "researcherId", server: "researcher_id", use: "Finds your articles in Web of Science." },
  { key: "orcid", server: "orcid", use: "Also used to find your articles." },
  { key: "scopus", server: "scopus_id", use: "Shown on your CV." },
]

/** What happened on the way back from ORCID (/profile?orcid=…) */
const ORCID_OUTCOMES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Your ORCID iD is connected: PEA now knows it really is yours." },
  denied: { ok: false, text: "ORCID access wasn't granted, so nothing changed." },
  expired: { ok: false, text: "The ORCID sign-in expired or didn't match this browser. Try connecting again." },
  taken: { ok: false, text: "That ORCID iD is already connected to another PEA account. Contact your admin if it's yours." },
  error: { ok: false, text: "The ORCID sign-in couldn't be completed. Try again later." },
  not_configured: { ok: false, text: "ORCID isn't set up on this server yet." },
}

const draftOf = (identifiers: Identifiers) =>
  Object.fromEntries(SERVER_IDENTIFIERS.map(({ server }) => [server, identifiers[server] ?? ""])) as Record<keyof Identifiers, string>

/**
 * ORCID iD, ResearcherID and Scopus Author ID, saved on the profile. PEA uses them to find the person's publications
 * (evaluation form: "Missing from your form"; CV builder: import and metrics) and shows them on the CV.
 */
export function IdentifiersCard({ profile }: { profile: MyProfile }) {
  const saved = draftOf(profile.identifiers)
  const [draft, setDraft] = useState(saved)
  const [touched, setTouched] = useState<Partial<Record<keyof Identifiers, boolean>>>({})
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const [orcidOutcome] = useState(() => ORCID_OUTCOMES[new URLSearchParams(location.search).get("orcid") ?? ""] ?? null)
  const [disconnecting, setDisconnecting] = useState(false)

  // Show the ORCID outcome once, then drop it from the address so a reload doesn't repeat it
  useEffect(() => {
    if (new URLSearchParams(location.search).has("orcid")) navigate({ pathname: location.pathname, hash: location.hash }, { replace: true })
  }, [location.search, location.pathname, location.hash, navigate])

  const disconnect = async () => {
    setDisconnecting(true)
    setError(null)
    try { await disconnectOrcid() } catch (cause) { setError(cause instanceof ApiError ? cause.message : "Couldn't disconnect ORCID. Try again.") } finally { setDisconnecting(false) }
  }

  const defOf = (key: ProfileKey) => PROFILE_DEFS.find(def => def.key === key)!
  const problems = Object.fromEntries(SERVER_IDENTIFIERS.map(({ key, server }) => [server, draft[server] ? defOf(key).validate(defOf(key).normalise(draft[server])) : null]))
  const dirty = SERVER_IDENTIFIERS.some(({ server }) => draft[server].trim() !== saved[server])
  const invalid = Object.values(problems).some(Boolean)

  const save = async () => {
    setTouched({ orcid: true, researcher_id: true, scopus_id: true })
    if (invalid) return
    setSaving(true)
    setError(null)
    try {
      const body = Object.fromEntries(SERVER_IDENTIFIERS.map(({ key, server }) => [server, draft[server] ? defOf(key).normalise(draft[server]) : ""]))
      const updated = await saveIdentifiers(body)
      setDraft(draftOf(updated.identifiers))
      setNotice(true)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Your identifiers weren't saved. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div id="identifiers" className="dashboard-card profile-card identifiers-card">
      <div className="card-heading">
        <div>
          <h3>Research identifiers</h3>
          <p className="card-subtitle">Used to find your publications in Web of Science and shown on your CV.</p>
        </div>
        <div className="page-actions">
          <span className="save-status" role="status">{notice && !dirty && <><Check aria-hidden="true" />Saved</>}</span>
          <Button className="dashboard-button" disabled={!dirty || saving} onClick={() => void save()}><Save />{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
      {error && <p className="form-error-summary" role="alert">{error}</p>}
      {orcidOutcome && <p className={orcidOutcome.ok ? "identifiers-outcome" : "form-error-summary"} role="status">{orcidOutcome.ok && <BadgeCheck aria-hidden="true" />}{orcidOutcome.text}</p>}
      <div className="identifiers-grid">
        {SERVER_IDENTIFIERS.map(({ key, server, use }) => {
          const def = defOf(key)
          const id = `identifier-${server}`
          const problem = touched[server] ? problems[server] : null
          const value = draft[server]
          const valid = value && !problems[server]
          const verified = server === "orcid" && profile.orcid_verified && !!profile.identifiers.orcid
          if (verified) return (
            <div key={server} className="form-field">
              <span className="identifier-label">{def.label}</span>
              <p className="identifier-verified">
                <a href={def.toUrl(profile.identifiers.orcid!)} target="_blank" rel="noopener noreferrer">{profile.identifiers.orcid}<ExternalLink aria-hidden="true" /></a>
                <span className="identifier-badge"><BadgeCheck aria-hidden="true" />Verified with ORCID</span>
              </p>
              <p className="field-hint">Proven by signing in to ORCID. {use} <button type="button" className="text-action" disabled={disconnecting} onClick={() => void disconnect()}>Disconnect to change it</button></p>
            </div>
          )
          return (
            <div key={server} className="form-field">
              <label htmlFor={id}>{def.label}</label>
              <div className="cv-link-input">
                <input id={id} className="form-control" value={value} placeholder={def.placeholder} spellCheck={false}
                  inputMode={key === "scopus" ? "numeric" : undefined}
                  aria-invalid={problem ? true : undefined} aria-describedby={`${id}-hint`}
                  onChange={event => { setDraft(current => ({ ...current, [server]: event.target.value })); setNotice(false) }}
                  onBlur={() => {
                    if (value) setDraft(current => ({ ...current, [server]: def.normalise(value) }))
                    setTouched(current => ({ ...current, [server]: true }))
                  }} />
                {valid && <a className="cv-link-open" href={def.toUrl(def.normalise(value))} target="_blank" rel="noopener noreferrer" aria-label={`Open ${def.label} profile in a new tab`}><CircleCheck aria-hidden="true" className="cv-link-ok" /><ExternalLink aria-hidden="true" /></a>}
              </div>
              <p id={`${id}-hint`} className={problem ? "field-error" : "field-hint"}>{problem ?? `${def.hint} ${use}`}</p>
              {server === "orcid" && <a className={buttonVariants({ variant: "outline", className: "dashboard-button identifier-connect" })} href={CONNECT_ORCID_URL}><Link2 aria-hidden="true" />Connect ORCID iD</a>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
