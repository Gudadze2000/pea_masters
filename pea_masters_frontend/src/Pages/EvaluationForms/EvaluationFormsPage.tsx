import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { Check, Copy, Eye, FileText, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import { ApiError } from "@/lib/api"
import { peopleOrganizations, useSession } from "@/lib/auth"
import { formsApi, type FormSummary } from "@/lib/evaluations"
import { useLanguage } from "@/lib/language-context"
import { localName } from "@/lib/people"
import { ConfirmSheet } from "@/Pages/People/ConfirmSheet"
import { countLabel } from "./form-draft"
import "@/components/forms/forms.css"
import "@/Pages/People/PeoplePage.css"
import "./EvaluationForms.css"

const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""

/** The address of the editor for a form, a new form, or a copy */
export function editorPath(orgId: string, formId: string, copyOf?: string) {
  const query = new URLSearchParams({ org: orgId, ...(copyOf ? { copy: copyOf } : {}) })
  return `/admin/evaluation-forms/${encodeURIComponent(formId)}?${query}`
}

/**
 * Admins and Coordinators: the forms they can send to researchers. The built-in ISU form can be viewed and copied;
 * a coordinator's own forms can be changed by them and by the organization's Admins.
 */
export function EvaluationFormsPage() {
  const session = useSession()
  const navigate = useNavigate()
  const { language } = useLanguage()
  const organizations = session ? peopleOrganizations(session) : []
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? "")
  const org = organizations.find(item => item.id === orgId) ?? organizations[0]

  const [forms, setForms] = useState<FormSummary[] | null>(null)
  const [error, setError] = useState("")
  const [removing, setRemoving] = useState<FormSummary | null>(null)
  const [notice, setNotice] = useState("")
  const noticeTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(noticeTimer.current), [])

  const load = useCallback(async () => {
    if (!org) return
    try {
      setForms(await formsApi.list(org.id))
      setError("")
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The forms couldn't be loaded.")
    }
  }, [org])

  useEffect(() => { void load() }, [load])

  if (!org) return null // RequireStaff only lets Admins and Coordinators in

  const isAdmin = session?.isRoot || org.roles.includes("admin")
  const builtIn = forms?.filter(form => form.built_in) ?? []
  const custom = forms?.filter(form => !form.built_in) ?? []

  function row(form: FormSummary) {
    const name = form.name.en
    return (
      <tr key={form.id}>
        <td>
          <div className="person-name">
            <button type="button" className="form-list-name" onClick={() => navigate(editorPath(org!.id, form.id))}>{name}</button>
            {form.name.ka && <small lang="ka">{form.name.ka}</small>}
          </div>
        </td>
        <td className="nowrap">{countLabel(form.parts, form.items)}</td>
        <td>{form.built_in ? <span className="role-chip">Built in</span> : form.owner?.name}</td>
        <td className="nowrap">{form.built_in ? "" : formatDate(form.updated_at)}</td>
        <td>
          <div className="row-actions">
            {form.can_edit
              ? <Button variant="outline" size="icon" className="icon-button" aria-label={`Edit ${name}`} title="Edit" onClick={() => navigate(editorPath(org!.id, form.id))}><Pencil /></Button>
              : <Button variant="outline" size="icon" className="icon-button" aria-label={`View ${name}`} title="View" onClick={() => navigate(editorPath(org!.id, form.id))}><Eye /></Button>}
            <Button variant="outline" size="icon" className="icon-button" aria-label={`Make a copy of ${name}`} title="Make a copy" onClick={() => navigate(editorPath(org!.id, "new", form.id))}><Copy /></Button>
            {form.can_edit && <Button variant="outline" size="icon" className="icon-button danger" aria-label={`Remove ${name}`} title="Remove" onClick={() => setRemoving(form)}><Trash2 /></Button>}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <WorkspaceLayout breadcrumb={[{ label: "Evaluation forms" }]}>
      {() => (
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <h1>Evaluation forms</h1>
              <p>The forms you send to researchers. The built-in ISU form can't be changed: make a copy and adapt it.</p>
            </div>
            <div className="page-actions">
              <span className="save-status" role="status">{notice && <><Check aria-hidden="true" />{notice}</>}</span>
              {organizations.length > 1 && (
                <select className="form-control org-select" aria-label="Organization" value={org.id} onChange={event => { setForms(null); setOrgId(event.target.value) }}>
                  {organizations.map(item => <option key={item.id} value={item.id}>{localName(item.name, language)}</option>)}
                </select>
              )}
              <Button className="dashboard-button" onClick={() => navigate(editorPath(org.id, "new"))}><Plus />New form</Button>
            </div>
          </div>

          {error && <p className="form-error-summary" role="alert">{error} <Button variant="link" onClick={() => void load()}>Try again</Button></p>}
          {forms === null && !error && <p role="status">Loading forms…</p>}
          {forms !== null && (
            <section className="dashboard-card" aria-labelledby="forms-heading">
              <div className="card-heading">
                <div>
                  <h2 id="forms-heading">{isAdmin ? "Forms in this organization" : "Your forms"}</h2>
                  <p className="form-list-subtitle">{isAdmin ? "Every coordinator's forms, which you can change too." : "Only you and your organization's Admins see the forms you make."}</p>
                </div>
              </div>
              <div className="data-table-wrap">
                <table className="data-table form-list-table">
                  <thead>
                    <tr><th scope="col">Form</th><th scope="col">Contents</th><th scope="col">Made by</th><th scope="col">Last changed</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
                  </thead>
                  <tbody>
                    {builtIn.map(row)}
                    {custom.map(row)}
                    {custom.length === 0 && (
                      <tr><td colSpan={5} className="data-table-empty"><FileText aria-hidden="true" /> No forms of your own yet. Make a copy of the ISU form, or start a new one.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {removing && (
            <ConfirmSheet
              title={`Remove ${removing.name.en}?`}
              description="It disappears from the list of forms. Forms already sent to researchers with it aren't affected."
              confirmLabel="Remove form"
              destructive
              onConfirm={async () => {
                await formsApi.archive(org.id, removing.id)
                setRemoving(null)
                setNotice(`${removing.name.en} was removed.`)
                window.clearTimeout(noticeTimer.current)
                noticeTimer.current = window.setTimeout(() => setNotice(""), 5000)
                await load()
              }}
              onClose={() => setRemoving(null)}
            />
          )}
        </div>
      )}
    </WorkspaceLayout>
  )
}
