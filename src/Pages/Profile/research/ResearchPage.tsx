import { useEffect, useRef, useState } from "react"
import { Check, Pencil, Plus, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import { KeywordInput } from "@/components/forms/KeywordInput"
import { RecordSheet } from "@/components/forms/RecordSheet"
import type { FieldDef } from "@/components/forms/field-types"
import "@/components/forms/forms.css"
import { initialResearch, PROJECT_ROLES, PROJECT_TYPES, type Collaboration, type Project, type ResearchOverview } from "./researchMock"
import "./ResearchPage.css"

const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: currentYear + 6 - 1990 }, (_, i) => String(currentYear + 5 - i))

const projectFields: FieldDef[] = [
  { name: "title", label: "Project title", type: "text", required: true },
  { name: "donor", label: "Donor / funder", type: "text", required: true, span: 2, placeholder: "e.g. Horizon Europe, GNSF" },
  { name: "type", label: "Type", type: "select", required: true, span: 2, options: PROJECT_TYPES },
  { name: "startYear", label: "Start year", type: "select", required: true, span: 2, options: YEARS },
  { name: "endYear", label: "End year", type: "select", span: 2, options: YEARS, hint: "Leave empty if ongoing." },
  { name: "role", label: "Your role", type: "select", required: true, span: 2, options: PROJECT_ROLES },
]

const collaborationFields: FieldDef[] = [
  { name: "name", label: "Researcher", type: "text", required: true, span: 2, placeholder: "e.g. Dr. K. Schulz" },
  { name: "institution", label: "Institution", type: "text", required: true, span: 2 },
  { name: "topic", label: "Topic", type: "text", required: true },
]

/** "Dr. K. Schulz" → "KS", "David Mchedlidze" → "DM" */
function initials(name: string) {
  const words = name.split(/\s+/).filter(word => word && !/^(dr|prof|mr|ms|mrs)\.?$/i.test(word))
  if (!words.length) return "?"
  return ((words[0][0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase()
}

const period = (project: Project) => `${project.startYear} – ${project.endYear || "present"}`
const sameData = (a: ResearchOverview, b: ResearchOverview) => JSON.stringify(a) === JSON.stringify(b)

type Editor =
  | { kind: "project"; id: string | null; session: number }
  | { kind: "collaboration"; id: null; session: number }

/** /profile/research */
export function ResearchPage() {
  const [saved, setSaved] = useState<ResearchOverview>(initialResearch)
  const [data, setData] = useState<ResearchOverview>(initialResearch)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(false)
  const session = useRef(0)
  const timer = useRef<number | undefined>(undefined)

  const dirty = !sameData(data, saved)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const change = (update: (current: ResearchOverview) => ResearchOverview) => {
    setData(update)
    setNotice(false)
  }

  const openEditor = (next: Omit<Editor, "session">) => {
    session.current += 1
    setEditor({ ...next, session: session.current } as Editor)
    setSheetOpen(true)
  }

  const save = () => {
    setSaving(true)
    // TODO: replace with the API call once the back end exists
    timer.current = window.setTimeout(() => {
      setSaved(data)
      setSaving(false)
      setNotice(true)
      timer.current = window.setTimeout(() => setNotice(false), 4000)
    }, 500)
  }

  const editingProject = editor?.kind === "project" && editor.id ? data.projects.find(project => project.id === editor.id) : undefined

  return (
    <WorkspaceLayout breadcrumb={[{ label: "My profile", to: "/profile/general" }, { label: "Research overview" }]}>
      {() => (
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <h1>Research overview</h1>
              <p>Research interests, projects and collaborations.</p>
            </div>
            <div className="page-actions">
              <span className="save-status" role="status">{notice && !dirty && <><Check aria-hidden="true" />Changes saved</>}</span>
              {dirty && <Button variant="outline" className="dashboard-button" disabled={saving} onClick={() => setData(saved)}>Discard changes</Button>}
              <Button className="dashboard-button" disabled={!dirty || saving} onClick={save}><Save />{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>

          <section className="dashboard-card research-card" aria-labelledby="interests-heading">
            <div className="card-heading"><h2 id="interests-heading">Research interests</h2></div>
            <KeywordInput
              id="research-interests"
              keywords={data.interests}
              onChange={interests => change(current => ({ ...current, interests }))}
              label="Research interests"
              inputLabel="New research interest"
              showAddButton={false}
              emptyText="No research interests yet. Add keywords that describe your research."
            />
          </section>

          <section className="dashboard-card research-card" aria-labelledby="projects-heading">
            <div className="card-heading">
              <h2 id="projects-heading">Projects</h2>
              <Button className="dashboard-button compact" onClick={() => openEditor({ kind: "project", id: null })}><Plus />Add project</Button>
            </div>
            <div className="data-table-wrap">
              <table className="data-table projects-table">
                <thead>
                  <tr>
                    <th scope="col">Title</th><th scope="col">Donor</th><th scope="col">Period</th><th scope="col">Type</th><th scope="col">Role</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.projects.length === 0
                    ? <tr><td colSpan={6} className="data-table-empty">No projects yet. Use “Add project” to add one.</td></tr>
                    : data.projects.map(project => (
                      <tr key={project.id}>
                        <td>{project.title}</td>
                        <td>{project.donor}</td>
                        <td className="nowrap">{period(project)}</td>
                        <td><span className={`type-pill ${project.type === "International" ? "international" : "local"}`}>{project.type}</span></td>
                        <td>{project.role}</td>
                        <td>
                          <div className="row-actions">
                            <Button variant="outline" size="icon" className="icon-button" aria-label={`Edit ${project.title}`} onClick={() => openEditor({ kind: "project", id: project.id })}><Pencil /></Button>
                            <Button variant="outline" size="icon" className="icon-button danger" aria-label={`Delete ${project.title}`} onClick={() => change(current => ({ ...current, projects: current.projects.filter(item => item.id !== project.id) }))}><Trash2 /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dashboard-card research-card" aria-labelledby="collaboration-heading">
            <div className="card-heading">
              <h2 id="collaboration-heading">Research collaboration with other researchers</h2>
              <Button variant="outline" className="dashboard-button compact" onClick={() => openEditor({ kind: "collaboration", id: null })}><Plus />Add collaboration</Button>
            </div>
            <div className="data-table-wrap">
              <table className="data-table collaborations-table">
                <thead>
                  <tr>
                    <th scope="col">Researcher</th><th scope="col">Institution</th><th scope="col">Topic</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {data.collaborations.length === 0
                    ? <tr><td colSpan={4} className="data-table-empty">No collaborations yet.</td></tr>
                    : data.collaborations.map(person => (
                      <tr key={person.id}>
                        <td><span className="researcher"><span className="researcher-avatar" aria-hidden="true">{initials(person.name)}</span>{person.name}</span></td>
                        <td>{person.institution}</td>
                        <td>{person.topic}</td>
                        <td>
                          <div className="row-actions">
                            <Button variant="outline" size="icon" className="icon-button danger" aria-label={`Remove ${person.name}`} onClick={() => change(current => ({ ...current, collaborations: current.collaborations.filter(item => item.id !== person.id) }))}><Trash2 /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="dashboard-card research-card" aria-labelledby="organisations-heading">
            <div className="card-heading"><h2 id="organisations-heading">Collaborating universities &amp; organisations</h2></div>
            <KeywordInput
              id="research-organisations"
              keywords={data.organisations}
              onChange={organisations => change(current => ({ ...current, organisations }))}
              label="Collaborating organisations"
              inputLabel="New organisation"
              placeholder="Add an organisation"
              emptyText="No organisations yet."
              maxItems={30}
              maxLength={120}
            />
          </section>

          {editor?.kind === "project" && (
            <RecordSheet
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              formKey={editor.session}
              idPrefix="project"
              title={editingProject ? "Edit project" : "Add project"}
              description="Research projects you led or took part in."
              fields={projectFields}
              initialValues={editingProject ? { ...editingProject } : {}}
              submitLabel={editingProject ? "Save project" : "Add project"}
              validate={(values): Record<string, string> => values.endYear && values.endYear < values.startYear ? { endYear: "Can't be before the start year." } : {}}
              onSave={values => {
                const project: Project = {
                  id: editingProject?.id ?? crypto.randomUUID(),
                  title: values.title, donor: values.donor, startYear: values.startYear, endYear: values.endYear ?? "",
                  type: values.type as Project["type"], role: values.role,
                }
                change(current => ({
                  ...current,
                  projects: editingProject ? current.projects.map(item => item.id === project.id ? project : item) : [project, ...current.projects],
                }))
                setSheetOpen(false)
              }}
            />
          )}
          {editor?.kind === "collaboration" && (
            <RecordSheet
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              formKey={editor.session}
              idPrefix="collaboration"
              title="Add collaboration"
              description="A researcher you work with, at Ilia State University or elsewhere."
              fields={collaborationFields}
              initialValues={{}}
              submitLabel="Add collaboration"
              onSave={values => {
                const person: Collaboration = { id: crypto.randomUUID(), name: values.name, institution: values.institution, topic: values.topic }
                change(current => ({ ...current, collaborations: [...current.collaborations, person] }))
                setSheetOpen(false)
              }}
            />
          )}
        </div>
      )}
    </WorkspaceLayout>
  )
}
