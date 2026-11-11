import { useEffect, useRef, useState } from "react"
import { Check, Info, RefreshCw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import { KeywordInput } from "@/components/forms/KeywordInput"
import "@/components/forms/forms.css"
import { initialInterests, lastSynced, programmes, students } from "./teachingMock"
import "./TeachingPage.css"

const syncedLabel = new Date(lastSynced).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

/** /profile/teaching */
export function TeachingPage() {
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
    // TODO: replace with the API call once the back end exists
    timer.current = window.setTimeout(() => {
      setSavedInterests(interests)
      setSaving(false)
      setNotice(true)
      timer.current = window.setTimeout(() => setNotice(false), 4000)
    }, 500)
  }

  return (
    <WorkspaceLayout breadcrumb={[{ label: "My profile", to: "/profile/general" }, { label: "Teaching" }]}>
      {() => (
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <h1>Teaching</h1>
              <p>Interests are entered by you; programmes and supervised students come from Argus.</p>
            </div>
            <div className="teaching-actions">
              <span className="save-status" role="status">{notice && !dirty && <><Check aria-hidden="true" />Changes saved</>}</span>
              <Button className="dashboard-button" disabled={!dirty || saving} onClick={save}><Save />{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>

          <section className="dashboard-card teaching-card" aria-labelledby="interests-heading">
            <div className="card-heading">
              <h2 id="interests-heading">Teaching interests</h2>
              <span className="card-meta">Free text keywords</span>
            </div>
            <KeywordInput id="teaching-interests" keywords={interests} onChange={next => { setInterests(next); setNotice(false) }} label="Teaching interests" inputLabel="New teaching interest" emptyText="No keywords yet. Add the subjects you teach or would like to teach." />
          </section>

          <section className="dashboard-card teaching-card" aria-labelledby="programmes-heading">
            <div className="card-heading"><h2 id="programmes-heading">Coordinated programmes &amp; modules</h2></div>
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
                    : programmes.map(item => (
                      <tr key={item.id}><td>{item.name}</td><td>{item.level}</td><td>{item.year}</td><td>{item.ects}</td></tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dashboard-card teaching-card" aria-labelledby="students-heading">
            <div className="card-heading">
              <h2 id="students-heading">Supervised students</h2>
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
          </section>
        </div>
      )}
    </WorkspaceLayout>
  )
}
