import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useBlocker, useNavigate, useSearchParams } from "react-router"
import { ArrowLeft, Check, Download, FileSpreadsheet, Plus, Trash2, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import "@/components/forms/forms.css"
import type { Role } from "@/lib/auth"
import { peopleOrganizations, useSession } from "@/lib/auth"
import { ApiError } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"
import { nameFromEmail } from "@/lib/names"
import { groupByFaculty, localName, peopleApi, structureApi, type Person, type Unit } from "@/lib/people"
import {
  blankRow, checkRows, downloadTemplate, IMPORT_LIMIT, importApi, ImportFileError, isBlank, readPeopleFile,
  type Importer, type ImportRow, type RowField,
} from "@/lib/people-import"
import { ConfirmDialog } from "@/Pages/CvBuilder/cv-ui"
import "./PeoplePage.css"

const ROLE_OPTIONS: { role: Role; label: string }[] = [
  { role: "member", label: "Researcher" }, { role: "coordinator", label: "Coordinator" }, { role: "admin", label: "Admin" },
]

type Counts = { add: number; deactivate: number }
type Stage = { kind: "editing" } | { kind: "checking" } | ({ kind: "confirm" } & Counts) | { kind: "saving" } | ({ kind: "done" } & Counts)

const people = (count: number) => `${count} ${count === 1 ? "person" : "people"}`

/** "Register 3 people", "Deactivate 1 person", "Register 3 and deactivate 1" */
function actionLabel({ add, deactivate }: Counts) {
  if (add && deactivate) return `Register ${add} and deactivate ${deactivate}`
  if (deactivate) return `Deactivate ${people(deactivate)}`
  return add ? `Register ${people(add)}` : "Register people"
}

/**
 * Registers and deactivates many people at once. Rows are typed in with "+ Add row" or filled from an Excel file;
 * the file is read in the browser and never uploaded. Every row is checked as it's edited, then by the server, and
 * nothing is saved until the whole list is fine. People already registered are reported, never changed.
 * Admins act on anyone; Coordinators register Researchers into their own department and deactivate their own
 * Researchers (the backend enforces the same rules).
 */
export function ImportPeoplePage() {
  const session = useSession()
  const navigate = useNavigate()
  const { language } = useLanguage()
  const [params] = useSearchParams()
  const organizations = session ? peopleOrganizations(session) : []
  const org = organizations.find(item => item.id === params.get("org")) ?? organizations[0]

  const [units, setUnits] = useState<Unit[]>([])
  const [registeredPeople, setRegisteredPeople] = useState<Person[]>([])
  const [access, setAccess] = useState<{ canRegister: boolean; canManageRoles: boolean } | null>(null)
  const [loadError, setLoadError] = useState("")
  const [rows, setRows] = useState<ImportRow[]>(() => [blankRow()])
  const [stage, setStage] = useState<Stage>({ kind: "editing" })
  const [showAll, setShowAll] = useState(false)
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const importer: Importer = useMemo(() => ({
    canManageRoles: access?.canManageRoles ?? false,
    coordinated: org?.coordinates.map(unit => unit.id) ?? [],
    email: session?.email ?? "",
  }), [access, org, session])

  useEffect(() => {
    if (!org) return
    let cancelled = false
    Promise.all([peopleApi.list(org.id), structureApi.list(org.id)])
      .then(([list, structure]) => {
        if (cancelled) return
        setRegisteredPeople(list.people); setUnits(structure)
        setAccess({ canRegister: list.can_register, canManageRoles: list.can_manage_roles }); setLoadError("")
        // A Coordinator's first row starts in their department
        const coordinated = org.coordinates.map(unit => unit.id)
        setRows(current => (current.length === 1 && isBlank(current[0])
          ? [blankRow(structure, { canManageRoles: list.can_manage_roles, coordinated, email: "" })] : current))
      })
      .catch(cause => { if (!cancelled) setLoadError(cause instanceof ApiError ? cause.message : "Couldn't load the organization. Please try again.") })
    return () => { cancelled = true }
  }, [org])

  const registered = useMemo(() => new Map(registeredPeople.map(person => [person.email.toLowerCase(), person])), [registeredPeople])
  const problems = useMemo(() => checkRows(rows, { units, registered, importer, language }), [rows, units, registered, importer, language])
  const filled = rows.filter(row => !isBlank(row))
  const counts: Counts = { add: filled.filter(row => !row.deactivate).length, deactivate: filled.filter(row => row.deactivate).length }
  const problemCount = filled.filter(row => problems.has(row.key)).length
  // Coordinators see only the departments they coordinate (and their faculties)
  const ownUnits = importer.canManageRoles ? units : units.filter(unit =>
    unit.kind === "department" ? importer.coordinated.includes(unit.id)
      : units.some(d => d.parent_id === unit.id && importer.coordinated.includes(d.id)))
  const groups = groupByFaculty(ownUnits, language)
  const faculties = groups.flatMap(group => (group.faculty ? [group.faculty] : []))

  const dirty = stage.kind !== "done" && filled.length > 0
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)

  function update(key: string, change: Partial<ImportRow>) {
    setRows(current => current.map(row => (row.key === key ? { ...row, ...change, serverError: null } : row)))
    if (stage.kind === "confirm") setStage({ kind: "editing" })
  }

  function addRow() {
    if (rows.length >= IMPORT_LIMIT) return
    setRows(current => [...current, blankRow(units, importer)])
    // Focus the new row's email once it's on the page
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>(".import-table input[type=email]")
      inputs[inputs.length - 1]?.focus()
    })
  }

  async function importFile(file: File | undefined) {
    if (!file) return
    setMessage(null)
    try {
      const read = await readPeopleFile(file, units, importer)
      const kept = rows.filter(row => !isBlank(row))
      if (kept.length + read.length > IMPORT_LIMIT) {
        setMessage({ tone: "error", text: `That would make ${kept.length + read.length} rows. Use at most ${IMPORT_LIMIT} at a time.` })
        return
      }
      setRows([...kept, ...read])
      setShowAll(true)
      setMessage({ tone: "info", text: `Added ${read.length} ${read.length === 1 ? "row" : "rows"} from ${file.name}. Check the list below, then save it.` })
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof ImportFileError ? cause.message : "Couldn't read this file." })
    } finally {
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  function showServerVerdicts(results: { message: string | null }[]) {
    const verdicts = new Map(filled.map((row, index) => [row.key, results[index]?.message ?? null]))
    setRows(current => current.map(row => (verdicts.has(row.key) ? { ...row, serverError: verdicts.get(row.key) ?? null } : row)))
    setOnlyProblems(true)
  }

  async function check() {
    if (!org || filled.length === 0) return
    setMessage(null)
    if (problemCount > 0) {
      setOnlyProblems(true)
      setMessage({ tone: "error", text: `${problemCount} ${problemCount === 1 ? "row needs" : "rows need"} fixing first. They're shown below.` })
      return
    }
    setStage({ kind: "checking" })
    try {
      const result = await importApi.run(org.id, filled, false)
      if (result.errors > 0) {
        showServerVerdicts(result.results)
        setMessage({ tone: "error", text: `The server found ${result.errors} ${result.errors === 1 ? "row" : "rows"} to fix. Nothing has been saved.` })
        setStage({ kind: "editing" })
        return
      }
      setStage({ kind: "confirm", ...counts })
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof ApiError ? cause.message : "Couldn't check the list. Please try again." })
      setStage({ kind: "editing" })
    }
  }

  async function save() {
    if (!org || stage.kind !== "confirm") return
    setStage({ kind: "saving" })
    try {
      const result = await importApi.run(org.id, filled, true)
      if (result.errors === 0) {
        setStage({ kind: "done", add: result.registered, deactivate: result.deactivated })
        setMessage(null)
        return
      }
      // Something changed since the check (e.g. someone registered one of them meanwhile): show what
      showServerVerdicts(result.results)
      setMessage({ tone: "error", text: "Something changed since the check. Nothing has been saved: fix the rows shown and try again." })
      setStage({ kind: "editing" })
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof ApiError ? cause.message : "Couldn't save the list. Nothing has been saved; please try again." })
      setStage({ kind: "editing" })
    }
  }

  const breadcrumb = [{ label: "People", to: "/admin/people" }, { label: "Add several people" }]
  const busy = stage.kind === "checking" || stage.kind === "saving"

  if (!session || !org || access?.canRegister === false) {
    return (
      <WorkspaceLayout breadcrumb={breadcrumb}>
        {() => (
          <div className="dashboard-content">
            <div className="page-heading"><div><h1>Add several people</h1></div></div>
            <div className="dashboard-card"><p>Only Admins and Coordinators can register people from a list. <Link to="/admin/people">Back to People</Link></p></div>
          </div>
        )}
      </WorkspaceLayout>
    )
  }

  // Long lists: show the first 100 rows until asked for all (rendering 1000 rows of inputs at once is slow)
  const visible = rows.filter(row => !onlyProblems || problems.has(row.key))
  const shown = showAll ? visible : visible.slice(0, 100)

  return (
    <WorkspaceLayout breadcrumb={breadcrumb}>
      {() => (
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <h1>Add several people</h1>
              <p>
                {importer.canManageRoles
                  ? "Register people, or deactivate people already registered, several at a time. Type them in or fill the list from an Excel file."
                  : "Register Researchers in your department, or deactivate your Researchers, several at a time. Type them in or fill the list from an Excel file."}
                {" "}Nothing is saved until every row is correct and you confirm.
              </p>
            </div>
            <div className="page-actions">
              <Button variant="outline" className="dashboard-button" onClick={() => navigate("/admin/people")}><ArrowLeft />People</Button>
            </div>
          </div>

          {loadError && <div className="form-error-summary" role="alert">{loadError}</div>}

          {stage.kind === "done" ? (
            <section className="dashboard-card import-done" aria-live="polite">
              <Check aria-hidden="true" />
              <div>
                <h2>
                  {[stage.add && `${people(stage.add)} ${stage.add === 1 ? "was" : "were"} registered`,
                    stage.deactivate && `${people(stage.deactivate)} ${stage.deactivate === 1 ? "was" : "were"} deactivated`].filter(Boolean).join(", ")}
                </h2>
                <p>
                  {stage.add > 0 && "They can now sign in with their university Google account; their official Google names replace the names here when they first sign in. "}
                  {stage.deactivate > 0 && "Deactivated people were signed out and can't sign in; their data is kept and they can be reactivated on the People page."}
                </p>
              </div>
              <div className="import-done-actions">
                <Button className="dashboard-button" onClick={() => navigate("/admin/people")}>Back to People</Button>
                <Button variant="outline" className="dashboard-button" onClick={() => { setRows([blankRow(units, importer)]); setStage({ kind: "editing" }); setOnlyProblems(false) }}>Start a new list</Button>
              </div>
            </section>
          ) : (
            <section className="dashboard-card import-card" aria-labelledby="import-heading" aria-busy={busy}>
              <div className="card-heading import-heading">
                <h2 id="import-heading">People</h2>
                <div className="import-tools">
                  <Button variant="outline" className="dashboard-button" disabled={access === null}
                    onClick={() => void downloadTemplate(units, language, importer).catch(() => setMessage({ tone: "error", text: "Couldn't create the template. Please try again." }))}>
                    <Download />Download template
                  </Button>
                  <Button variant="outline" className="dashboard-button" disabled={busy || access === null} onClick={() => fileInput.current?.click()}>
                    <FileSpreadsheet />Fill from Excel
                  </Button>
                  <input ref={fileInput} type="file" hidden aria-hidden="true" tabIndex={-1}
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={event => void importFile(event.target.files?.[0])} />
                </div>
              </div>

              {message && (
                <div className={message.tone === "error" ? "form-error-summary" : "import-info"} role={message.tone === "error" ? "alert" : "status"}>
                  {message.tone === "error" && <TriangleAlert aria-hidden="true" />}{message.text}
                </div>
              )}

              <div className="import-summary">
                <span>{counts.add} to register{counts.deactivate > 0 && `, ${counts.deactivate} to deactivate`}</span>
                {problemCount > 0 && <span className="import-summary-problems">{problemCount} {problemCount === 1 ? "row needs" : "rows need"} fixing</span>}
                {(problemCount > 0 || onlyProblems) && (
                  <label className="import-filter">
                    <input type="checkbox" className="form-checkbox" checked={onlyProblems} onChange={event => setOnlyProblems(event.target.checked)} />
                    Show only rows that need fixing
                  </label>
                )}
              </div>

              <div className="data-table-wrap">
                <table className="data-table import-table">
                  <colgroup>
                    <col className="c-number" /><col className="c-email" /><col className="c-name" /><col /><col />
                    <col className="c-roles" /><col className="c-deactivate" /><col className="c-remove" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">#</th><th scope="col">University email *</th><th scope="col">Name <span className="optional">(optional)</span></th>
                      <th scope="col">Faculty</th><th scope="col">Department</th><th scope="col">{importer.canManageRoles ? "Roles *" : "Role"}</th>
                      <th scope="col">Deactivate</th><th scope="col"><span className="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.length === 0 ? (
                      <tr><td colSpan={8} className="data-table-empty">{onlyProblems ? "No rows need fixing." : "No one yet. Use “Add row” or fill the list from Excel."}</td></tr>
                    ) : shown.map(row => {
                      const index = rows.indexOf(row)
                      const found = problems.get(row.key) ?? {}
                      const label = row.sheetRow ? `Excel row ${row.sheetRow}` : `line ${index + 1}`
                      const error = (field: RowField) => found[field] && <p className="field-error" id={`${row.key}-${field}`}>{found[field]}</p>
                      const invalid = (field: RowField) => (found[field] ? { "aria-invalid": true, "aria-describedby": `${row.key}-${field}` } : {})
                      const departments = groups.filter(group => !row.facultyId || group.faculty?.id === row.facultyId)
                      const off = busy || row.deactivate // only the email matters when deactivating
                      return (
                        <tr key={row.key} data-problem={Object.keys(found).length > 0 || undefined} data-deactivate={row.deactivate || undefined}>
                          <td className="import-number" title={label}>{row.sheetRow ?? index + 1}</td>
                          <td>
                            <input className="form-control" type="email" autoComplete="off" value={row.email} disabled={busy}
                              aria-label={`Email, ${label}`} placeholder="name.surname@iliauni.edu.ge" {...invalid("email")}
                              onChange={event => update(row.key, { email: event.target.value })} />
                            {error("email")}
                            {row.deactivate && !found.email && <p className="field-hint">Will be deactivated: {registered.get(row.email.trim().toLowerCase())?.display_name ?? "this person"}.</p>}
                          </td>
                          <td>
                            <input className="form-control" type="text" autoComplete="off" value={row.deactivate ? "" : row.name} maxLength={200} disabled={off}
                              aria-label={`Name (optional), ${label}`} placeholder={row.deactivate ? "" : nameFromEmail(row.email) ?? "Optional"} {...invalid("name")}
                              onChange={event => update(row.key, { name: event.target.value })} />
                            {error("name")}
                          </td>
                          <td>
                            <select className="form-control" value={row.deactivate ? "" : row.facultyId} disabled={off} aria-label={`Faculty, ${label}`}
                              data-empty={row.facultyId && !row.deactivate ? undefined : true} {...invalid("faculty")}
                              onChange={event => {
                                const facultyId = event.target.value
                                const keepsDepartment = units.find(unit => unit.id === row.departmentId)?.parent_id === facultyId
                                update(row.key, { facultyId, facultyText: "", departmentId: keepsDepartment ? row.departmentId : "" })
                              }}>
                              <option value="">{row.facultyText ? `“${row.facultyText}”?` : row.deactivate ? "" : "No faculty"}</option>
                              {faculties.map(unit => <option key={unit.id} value={unit.id}>{localName(unit.name, language)}</option>)}
                            </select>
                            {error("faculty")}
                          </td>
                          <td>
                            <select className="form-control" value={row.deactivate ? "" : row.departmentId} disabled={off} aria-label={`Department, ${label}`}
                              data-empty={row.departmentId && !row.deactivate ? undefined : true} {...invalid("department")}
                              onChange={event => {
                                const departmentId = event.target.value
                                const unit = units.find(item => item.id === departmentId)
                                update(row.key, { departmentId, departmentText: "", facultyId: unit?.parent_id ?? row.facultyId })
                              }}>
                              <option value="">{row.departmentText ? `“${row.departmentText}”?` : row.deactivate ? "" : importer.canManageRoles ? "No department" : "Choose"}</option>
                              {departments.filter(group => group.departments.length > 0).map(group => (
                                <optgroup key={group.faculty?.id ?? "none"} label={group.faculty ? localName(group.faculty.name, language) : "Not in a faculty"}>
                                  {group.departments.map(unit => <option key={unit.id} value={unit.id}>{localName(unit.name, language)}</option>)}
                                </optgroup>
                              ))}
                            </select>
                            {error("department")}
                          </td>
                          <td>
                            {row.deactivate ? null : importer.canManageRoles ? (
                              <fieldset className="import-roles" aria-label={`Roles, ${label}`} {...invalid("roles")}>
                                {ROLE_OPTIONS.map(option => (
                                  <label key={option.role} title={option.role === "coordinator" ? "Coordinates their department: registers and manages its Researchers" : undefined}>
                                    <input type="checkbox" className="form-checkbox" disabled={busy} checked={row.roles.includes(option.role)}
                                      onChange={event => update(row.key, {
                                        roleText: "",
                                        roles: (["admin", "coordinator", "member"] as Role[]).filter(role =>
                                          role === option.role ? event.target.checked : row.roles.includes(role)),
                                      })} />
                                    {option.label}
                                  </label>
                                ))}
                              </fieldset>
                            ) : (
                              <p className="import-fixed-role">Researcher</p>
                            )}
                            {!row.deactivate && error("roles")}
                          </td>
                          <td className="import-deactivate">
                            <input type="checkbox" className="form-checkbox" disabled={busy} checked={row.deactivate}
                              aria-label={`Deactivate, ${label}`} {...invalid("deactivate")}
                              onChange={event => update(row.key, { deactivate: event.target.checked, deactivateText: "" })} />
                            {error("deactivate")}
                          </td>
                          <td>
                            <Button variant="outline" size="icon" className="icon-button" disabled={busy} aria-label={`Remove ${label}`}
                              onClick={() => setRows(current => {
                                const next = current.filter(item => item.key !== row.key)
                                return next.length ? next : [blankRow(units, importer)]
                              })}><Trash2 /></Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {visible.length > shown.length && (
                <Button variant="link" className="import-show-all" onClick={() => setShowAll(true)}>Show all {visible.length} rows</Button>
              )}

              <div className="import-footer">
                <Button variant="outline" className="dashboard-button" disabled={busy || rows.length >= IMPORT_LIMIT} onClick={addRow}
                  title={rows.length >= IMPORT_LIMIT ? `At most ${IMPORT_LIMIT} rows at a time` : undefined}>
                  <Plus />Add row
                </Button>
                <Button className="dashboard-button" disabled={busy || filled.length === 0} onClick={() => void check()}>
                  {stage.kind === "checking" ? "Checking…" : stage.kind === "saving" ? "Saving…" : actionLabel(counts)}
                </Button>
              </div>
            </section>
          )}

          <ConfirmDialog
            open={stage.kind === "confirm"}
            title={stage.kind === "confirm" ? `${actionLabel(stage)}?` : ""}
            description={stage.kind === "confirm" ? (
              <>
                The list has been checked: every row is fine.
                {stage.add > 0 && " The people registered can sign in with their university Google account right away."}
                {stage.deactivate > 0 && " The people deactivated are signed out at once and can't sign in; their data is kept and they can be reactivated later."}
              </>
            ) : ""}
            confirmLabel={stage.kind === "confirm" && stage.deactivate > 0 && stage.add === 0 ? "Deactivate" : "Save"}
            danger={stage.kind === "confirm" && stage.deactivate > 0}
            onConfirm={() => void save()}
            onCancel={() => setStage({ kind: "editing" })}
          />
          <ConfirmDialog
            open={blocker.state === "blocked"}
            title="Leave without saving?"
            description="This list hasn't been saved. If you leave now, it's lost."
            confirmLabel="Leave"
            cancelLabel="Stay on this page"
            danger
            onConfirm={() => blocker.proceed?.()}
            onCancel={() => blocker.reset?.()}
          />
        </div>
      )}
    </WorkspaceLayout>
  )
}
