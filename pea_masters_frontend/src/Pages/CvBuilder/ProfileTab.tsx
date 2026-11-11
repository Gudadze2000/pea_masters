import { useState } from "react"
import { CircleCheck, ExternalLink } from "lucide-react"
import { KeywordInput } from "@/components/forms/KeywordInput"
import type { CvData } from "./cv-model"
import { Field } from "./cv-ui"
import { describedBy, type ChangeCv } from "./form-utils"
import { PROFILE_DEFS, type ProfileKey } from "./identifiers"

const SUMMARY_MAX = 1200
const METRIC_SOURCES = ["Scopus", "Web of Science", "Google Scholar"]

/** "Profile & links" tab: headline, research statement, interests, research profile IDs and metrics. */
export function ProfileTab({ cv, change }: { cv: CvData; change: ChangeCv }) {
  // Profile IDs are checked once the researcher leaves the field, not on every keystroke
  const [touched, setTouched] = useState<Partial<Record<ProfileKey, boolean>>>({})

  const setPersonal = (key: keyof CvData["personal"], value: string) => change(current => ({ ...current, personal: { ...current.personal, [key]: value } }))
  const setMetric = (key: keyof CvData["metrics"], value: string) => change(current => ({ ...current, metrics: { ...current.metrics, [key]: value } }))
  const setProfile = (key: ProfileKey, value: string) => change(current => ({ ...current, profiles: { ...current.profiles, [key]: value } }))

  const summaryLength = cv.personal.summary.length

  return (
    <div className="cv-tab-panel">
      <section className="dashboard-card cv-card" aria-labelledby="cv-about-heading">
        <div className="card-heading"><h2 id="cv-about-heading">About you</h2></div>
        <div className="form-grid">
          <Field id="cv-headline" label="Headline" span={2} hint="Shown under your name. Defaults to your academic position.">
            <input id="cv-headline" className="form-control" value={cv.personal.headline} maxLength={120} aria-describedby="cv-headline-hint" onChange={e => setPersonal("headline", e.target.value)} />
          </Field>
          <Field id="cv-phone" label="Phone (optional)" span={2} hint="Hidden from visitors unless you allow it under Visibility.">
            <input id="cv-phone" className="form-control" type="tel" autoComplete="tel" value={cv.personal.phone} maxLength={40} placeholder="+995 5XX XX XX XX" aria-describedby="cv-phone-hint" onChange={e => setPersonal("phone", e.target.value)} />
          </Field>
          <Field id="cv-summary" label="Research statement" hint="A few sentences on what you study and why it matters.">
            <textarea id="cv-summary" className="form-control" rows={5} value={cv.personal.summary} maxLength={SUMMARY_MAX} aria-describedby="cv-summary-hint cv-summary-count" onChange={e => setPersonal("summary", e.target.value)} />
          </Field>
        </div>
        <p id="cv-summary-count" className="field-hint cv-counter">{summaryLength} / {SUMMARY_MAX} characters</p>
      </section>

      <section className="dashboard-card cv-card" aria-labelledby="cv-interests-heading">
        <div className="card-heading"><h2 id="cv-interests-heading">Research interests</h2></div>
        <KeywordInput
          id="cv-interests"
          keywords={cv.interests}
          onChange={interests => change(current => ({ ...current, interests }))}
          label="Research interests"
          inputLabel="New research interest"
          showAddButton={false}
          emptyText="No research interests yet. Add keywords that describe your research."
        />
      </section>

      <section className="dashboard-card cv-card" aria-labelledby="cv-profiles-heading">
        <div className="card-heading">
          <div>
            <h2 id="cv-profiles-heading">Research profiles</h2>
            <p className="card-subtitle">Links appear as badges under your name. Paste an ID or the full profile link.</p>
          </div>
        </div>
        <div className="form-grid">
          {PROFILE_DEFS.map(def => {
            const id = `cv-profile-${def.key}`
            const value = cv.profiles[def.key]
            const error = value && touched[def.key] ? def.validate(value) : null
            const valid = value && !def.validate(value)
            const hint = error ? undefined : def.hint
            return (
              <Field key={def.key} id={id} label={def.label} span={2} hint={hint} error={error ? `${error} It won't appear on your CV until it's fixed.` : null}>
                <div className="cv-link-input">
                  <input
                    id={id}
                    className="form-control"
                    value={value}
                    inputMode={def.key === "scopus" ? "numeric" : undefined}
                    placeholder={def.placeholder}
                    spellCheck={false}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy(id, error, hint)}
                    onChange={e => setProfile(def.key, e.target.value)}
                    onBlur={() => {
                      if (value) setProfile(def.key, def.normalise(value))
                      setTouched(current => ({ ...current, [def.key]: true }))
                    }}
                  />
                  {valid && (
                    <a className="cv-link-open" href={def.toUrl(value)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${def.label} profile in a new tab`}>
                      <CircleCheck aria-hidden="true" className="cv-link-ok" /><ExternalLink aria-hidden="true" />
                    </a>
                  )}
                </div>
              </Field>
            )
          })}
        </div>
      </section>

      <section className="dashboard-card cv-card" aria-labelledby="cv-metrics-heading">
        <div className="card-heading">
          <div>
            <h2 id="cv-metrics-heading">Research metrics</h2>
            <p className="card-subtitle">Optional. Shown as self-reported, with the source and date. Turn the section on in “Sections &amp; layout”.</p>
          </div>
        </div>
        <div className="form-grid">
          <Field id="cv-hindex" label="h-index" span={1}>
            <input id="cv-hindex" className="form-control" inputMode="numeric" value={cv.metrics.hIndex} maxLength={4} onChange={e => setMetric("hIndex", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field id="cv-citations" label="Total citations" span={1}>
            <input id="cv-citations" className="form-control" inputMode="numeric" value={cv.metrics.citations} maxLength={7} onChange={e => setMetric("citations", e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field id="cv-metric-source" label="Source" span={1}>
            <select id="cv-metric-source" className="form-control" value={cv.metrics.source} onChange={e => setMetric("source", e.target.value)}>
              {METRIC_SOURCES.map(source => <option key={source}>{source}</option>)}
            </select>
          </Field>
          <Field id="cv-metric-date" label="As of" span={1}>
            <input id="cv-metric-date" className="form-control" type="month" value={cv.metrics.asOf} onChange={e => setMetric("asOf", e.target.value)} />
          </Field>
        </div>
      </section>
    </div>
  )
}
