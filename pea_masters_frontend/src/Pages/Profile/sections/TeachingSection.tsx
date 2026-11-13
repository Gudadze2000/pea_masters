import { useEffect, useRef, useState } from "react"
import { Check, Info, RefreshCw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { KeywordInput } from "@/components/forms/KeywordInput"
import "@/components/forms/forms.css"
import { initialInterests, lastSynced, programmes, students } from "../teaching/teachingMock"
import "../teaching/TeachingPage.css"

const syncedLabel = new Date(lastSynced).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

/** Teaching: interests the person enters; programmes and supervised students imported from Argus. */
export function TeachingSection() {
  const [savedInterests, setSavedInterests] = useState(initialInterests)
  const [interests, setInterests] = useState(initialInterests)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const dirty = interests.join("\n") !== savedInterests.join("\n")

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const save = () => {
    setSaving(true)
    // TODO: replace with the API call once teaching is stored on the server
    timer.current = window.setTimeout(() => {
      setSavedInterests(interests)
      setSaving(false)
      setNotice(true)
      timer.current = window.setTimeout(() => setNotice(false), 4000)
    }, 500)
  }

  return (
    <section id="teaching" className="profile-section" aria-labelledby="teaching-heading">
      <div className="section-heading">
        <div>
          <h2 id="teaching-heading">Teaching</h2>
          <p>Interests are entered by you; programmes and supervised students come from Argus.</p>
        </div>
        <div className="page-actions">
          <span className="save-status" role="status">{notice && !dirty && <><Check aria-hidden="true" />Changes saved</>}</span>
          <Button className="dashboard-button" disabled={!dirty || saving} onClick={save}><Save />{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>

      <div className="dashboard-card teaching-card">
        <div className="card-heading">
          <h3 id="teaching-interests-heading">Teaching interests</h3>
          <span className="card-meta">Free text keywords</span>
        </div>
        <KeywordInput id="teaching-interests" keywords={interests} onChange={next => { setInterests(next); setNotice(false) }} label="Teaching interests" inputLabel="New teaching interest" emptyText="No keywords yet. Add the subjects you teach or would like to teach." />
      </div>

      <div className="dashboard-card teaching-card">
        <div className="card-heading"><h3>Coordinated programmes &amp; modules</h3></div>
        <div className="info-banner">
          <Info aria-hidden="true" />
          <div>
            <p>This list is imported automatically</p>
            <small>Programmes and modules are pulled from Argus. If something is missing, contact your admin.</small>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table programmes-table">
            <thead>
              <tr><th scope="col">Module / Programme</th><th scope="col">Level</th><th scope="col">Year</th><th scope="col">ECTS</th></tr>
            </thead>
            <tbody>
              {programmes.length === 0
                ? <tr><td colSpan={4} className="data-table-empty">No programmes imported yet.</td></tr>
                : programmes.map(item => <tr key={item.id}><td>{item.name}</td><td>{item.level}</td><td>{item.year}</td><td>{item.ects}</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dashboard-card teaching-card">
        <div className="card-heading">
          <h3>Supervised students</h3>
          <span className="sync-pill"><RefreshCw aria-hidden="true" />Synced from Argus · {syncedLabel}</span>
        </div>
        <div className="data-table-wrap">
          <table className="data-table students-table">
            <thead>
              <tr><th scope="col">Student</th><th scope="col">Level</th><th scope="col">Thesis title</th><th scope="col">Status</th></tr>
            </thead>
            <tbody>
              {students.length === 0
                ? <tr><td colSpan={4} className="data-table-empty">No supervised students imported yet.</td></tr>
                : students.map(student => (
                  <tr key={student.id}>
                    <td>{student.name}</td>
                    <td>{student.level}</td>
                    <td>{student.thesis}</td>
                    <td><span className={`status-badge status-${student.status.toLowerCase()}`}>{student.status}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
