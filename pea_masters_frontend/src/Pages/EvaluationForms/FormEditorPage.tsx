import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { useBlocker, useNavigate, useParams, useSearchParams } from "react-router"
import { ArrowDown, ArrowUp, Check, ChevronDown, Copy, Lock, Plus, Save, Trash2, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout"
import { ApiError } from "@/lib/api"
import { peopleOrganizations, useSession } from "@/lib/auth"
import { formsApi, type EvaluationFormDetail } from "@/lib/evaluations"
import { ConfirmDialog } from "@/Pages/CvBuilder/cv-ui"
import {
  blankDraft, copyName, countLabel, LIMITS, newItem, newPart, plural, pts, toDraft, toInput, validate,
  type Draft, type DraftItem, type DraftPart, type Problems,
} from "./form-draft"
import { FormPreview } from "./FormPreview"
import { editorPath } from "./EvaluationFormsPage"
import "@/components/forms/forms.css"
import "@/Pages/People/PeoplePage.css"
import "./EvaluationForms.css"

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"]

/** The most an item can add, if it has a limit: its own maximum, or entries × points */
function itemMax(item: DraftItem): number | null {
  if (item.max_points.trim() !== "") return Number(item.max_points) || 0
  if (!item.variable && item.max_entries.trim() !== "" && item.points.trim() !== "") return Number(item.max_entries) * Number(item.points)
  return null
}

function partAvailable(part: DraftPart): number | null {
  let total = 0
  for (const item of part.items) {
    const max = itemMax(item)
    if (max === null || !Number.isFinite(max)) return null
    total += max
  }
  return part.cap.trim() !== "" ? Math.min(total, Number(part.cap)) : total
}

function itemMeta(item: DraftItem) {
  const rate = item.variable ? "points vary per entry" : item.points.trim() ? `${pts(Number(item.points) || 0)} per entry` : "no points yet"
  const limits = [item.max_points.trim() && `max ${pts(Number(item.max_points) || 0)}`, item.max_entries.trim() && `up to ${item.max_entries} entries`].filter(Boolean)
  return [rate, ...limits].join(" · ")
}

/* ---------- fields ---------- */

type FieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: ReactNode
  span?: 1 | 2 | 4
  required?: boolean
  placeholder?: string
  lang?: string
  numeric?: boolean
  multiline?: boolean
  maxLength?: number
}

function Field({ id, label, value, onChange, error, hint, span = 4, required, placeholder, lang, numeric, multiline, maxLength = LIMITS.text }: FieldProps) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined
  const common = {
    id, value, lang, placeholder, maxLength, className: "form-control",
    "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, "aria-required": required || undefined,
  }
  return (
    <div className={`form-field span-${span}`}>
      <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      {multiline
        ? <textarea {...common} rows={2} onChange={event => onChange(event.target.value)} />
        : <input {...common} type="text" inputMode={numeric ? "decimal" : undefined} onChange={event => onChange(event.target.value)} />}
      {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
      {error && <p id={`${id}-error`} className="field-error">{error}</p>}
    </div>
  )
}

/* ---------- one item ---------- */

function ItemEditor({ item, index, count, open, problems, onToggle, onChange, onMove, onRemove }: {
  item: DraftItem; index: number; count: number; open: boolean; problems: Problems
  onToggle: () => void; onChange: (item: DraftItem) => void; onMove: (by: -1 | 1) => void; onRemove: () => void
}) {
  const p = (field: string) => problems[`${item.id}.${field}`]
  const hasProblem = ["name", "points", "max_points", "max_entries", "rule"].some(field => p(field))
  const set = (changes: Partial<DraftItem>) => onChange({ ...item, ...changes })
  const title = item.name.en.trim() || "Untitled item"
  const bodyId = `${item.id}-fields`
  return (
    <li className="form-item" data-open={open || undefined} data-problem={hasProblem || undefined}>
      <div className="form-item-summary">
        <button type="button" className="form-item-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <ChevronDown className="form-item-chevron" aria-hidden="true" />
          {item.code.trim() && <span className="evaluation-record-code">{item.code}</span>}
          <span className="form-item-title">
            <span>{title}</span>
            <small>{hasProblem ? <><TriangleAlert aria-hidden="true" /> Needs attention</> : itemMeta(item)}</small>
          </span>
        </button>
        <div className="row-actions">
          <Button variant="outline" size="icon" className="icon-button" aria-label={`Move ${title} up`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp /></Button>
          <Button variant="outline" size="icon" className="icon-button" aria-label={`Move ${title} down`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown /></Button>
          <Button variant="outline" size="icon" className="icon-button danger" aria-label={`Remove ${title}`} onClick={onRemove}><Trash2 /></Button>
        </div>
      </div>
      {open && (
        <div id={bodyId} className="form-item-body form-grid">
          <Field id={`${item.id}-code`} label="Number" span={1} value={item.code} maxLength={10} placeholder="1.1" onChange={code => set({ code })} />
          <Field id={`${item.id}-name`} label="Name (English)" span={2} required value={item.name.en} error={p("name")} onChange={en => set({ name: { ...item.name, en } })} />
          <Field id={`${item.id}-name-ka`} label="Name (Georgian)" span={1} lang="ka" value={item.name.ka} onChange={ka => set({ name: { ...item.name, ka } })} />
          <Field id={`${item.id}-points`} label={item.variable ? "Usual points per entry" : "Points per entry"} span={1} numeric required value={item.points} error={p("points")} onChange={points => set({ points })} />
          <Field id={`${item.id}-max-points`} label="Most points" span={1} numeric value={item.max_points} error={p("max_points")} placeholder="No limit" hint="All entries together" onChange={max_points => set({ max_points })} />
          <Field id={`${item.id}-max-entries`} label="Most entries" span={1} numeric value={item.max_entries} error={p("max_entries")} placeholder="No limit" onChange={max_entries => set({ max_entries })} />
          <div className="form-field span-1 form-check-field">
            <label className="form-check">
              <input type="checkbox" checked={item.variable} onChange={event => set({ variable: event.target.checked })} />
              Points vary per entry
            </label>
            <p className="field-hint">Researchers state each entry's points</p>
          </div>
          {item.variable && (
            <Field id={`${item.id}-rule`} label="How the points are worked out" multiline required maxLength={LIMITS.long} value={item.rule} error={p("rule")}
              placeholder="e.g. 15 points for the first program, 5 for each further one" onChange={rule => set({ rule })} />
          )}
          <Field id={`${item.id}-hint`} label="What researchers write in an entry" multiline maxLength={LIMITS.long} value={item.hint}
            placeholder="e.g. Article title, journal, year and link." onChange={hint => set({ hint })} />
        </div>
      )}
    </li>
  )
}

/* ---------- one part ---------- */

function PartEditor({ part, index, count, problems, openItems, onToggleItem, onChange, onMove, onRemove, onAddItem }: {
  part: DraftPart; index: number; count: number; problems: Problems; openItems: Set<string>
  onToggleItem: (id: string) => void; onChange: (part: DraftPart) => void; onMove: (by: -1 | 1) => void; onRemove: () => void
  onAddItem: () => void
}) {
  const p = (field: string) => problems[`${part.id}.${field}`]
  const set = (changes: Partial<DraftPart>) => onChange({ ...part, ...changes })
  const title = part.name.en.trim() || "Untitled part"
  const available = partAvailable(part)
  const moveItem = (from: number, by: -1 | 1) => {
    const items = [...part.items]
    const [moved] = items.splice(from, 1)
    items.splice(from + by, 0, moved)
    set({ items })
  }
  return (
    <section className="dashboard-card form-part" aria-labelledby={`${part.id}-heading`}>
      <div className="card-heading">
        <div>
          <h2 id={`${part.id}-heading`}>{part.numeral.trim() && `${part.numeral.trim()}. `}{title}</h2>
          <p className="form-list-subtitle">
            {plural(part.items.length, "item")}
            {available !== null ? ` · up to ${pts(available)} available` : " · no upper limit"}
            {part.min.trim() && ` · at least ${pts(Number(part.min) || 0)} needed`}
          </p>
        </div>
        <div className="row-actions">
          <Button variant="outline" size="icon" className="icon-button" aria-label={`Move ${title} up`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp /></Button>
          <Button variant="outline" size="icon" className="icon-button" aria-label={`Move ${title} down`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown /></Button>
          <Button variant="outline" size="icon" className="icon-button danger" aria-label={`Remove ${title}`} onClick={onRemove}><Trash2 /></Button>
        </div>
      </div>

      <div className="form-grid">
        <Field id={`${part.id}-numeral`} label="Numeral" span={1} value={part.numeral} maxLength={10} placeholder="I" onChange={numeral => set({ numeral })} />
        <Field id={`${part.id}-name`} label="Part name (English)" span={2} required value={part.name.en} error={p("name")} placeholder="Teaching" onChange={en => set({ name: { ...part.name, en } })} />
        <Field id={`${part.id}-name-ka`} label="Part name (Georgian)" span={1} lang="ka" value={part.name.ka} onChange={ka => set({ name: { ...part.name, ka } })} />
        <Field id={`${part.id}-min`} label="Points needed" span={1} numeric value={part.min} error={p("min")} placeholder="None" onChange={min => set({ min })} />
        <Field id={`${part.id}-cap`} label="Counts up to" span={1} numeric value={part.cap} error={p("cap")} placeholder="No limit" hint="Points above this don't count" onChange={cap => set({ cap })} />
        <Field id={`${part.id}-rule`} label="Note under the heading" span={2} value={part.rule} maxLength={200} placeholder="e.g. Required · at least 80 points" hint="Shown as written: update it when you change the points" onChange={rule => set({ rule })} />
      </div>

      <h3 className="form-items-heading">Items</h3>
      {p("items") && <p className="field-error" role="alert">{p("items")}</p>}
      <ol className="form-items">
        {part.items.map((item, itemIndex) => (
          <ItemEditor
            key={item.id}
            item={item}
            index={itemIndex}
            count={part.items.length}
            open={openItems.has(item.id)}
            problems={problems}
            onToggle={() => onToggleItem(item.id)}
            onChange={next => set({ items: part.items.map(other => (other.id === item.id ? next : other)) })}
            onMove={by => moveItem(itemIndex, by)}
            onRemove={() => set({ items: part.items.filter(other => other.id !== item.id) })}
          />
        ))}
      </ol>
      <Button variant="outline" className="dashboard-button form-add-item" disabled={part.items.length >= LIMITS.items} onClick={onAddItem}><Plus />Add item</Button>
    </section>
  )
}

/* ---------- the page ---------- */

type Tab = "edit" | "preview"

/**
 * Makes or changes an evaluation form: parts → items → points and limits. Saved with the Save button (or Ctrl+S);
 * leaving with unsaved changes asks first. Built-in forms open read-only, with "Make a copy".
 */
export function FormEditorPage() {
  const { formId = "new" } = useParams()
  const [search] = useSearchParams()
  const copyOf = formId === "new" ? search.get("copy") ?? "" : ""
  const navigate = useNavigate()
  const session = useSession()
  const organizations = session ? peopleOrganizations(session) : []
  const org = organizations.find(item => item.id === search.get("org")) ?? organizations[0]

  const [detail, setDetail] = useState<EvaluationFormDetail | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  /** The draft as last saved (JSON); null: never saved */
  const [saved, setSaved] = useState<string | null>(null)
  const [loadError, setLoadError] = useState("")
  const [tab, setTab] = useState<Tab>("edit")
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())
  const [showProblems, setShowProblems] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [justSaved, setJustSaved] = useState(false)
  const [removingPart, setRemovingPart] = useState<DraftPart | null>(null)
  /** Which form the page has loaded, so saving a new form (which changes the address) doesn't load it again */
  const loadedFor = useRef("")

  const loadKey = `${org?.id}:${formId}:${copyOf}`
  useEffect(() => {
    if (!org || loadedFor.current === loadKey) return
    let cancelled = false
    void (async () => {
      try {
        if (formId === "new" && copyOf) {
          const [source, list] = await Promise.all([formsApi.get(org.id, copyOf), formsApi.list(org.id)])
          const copy = toDraft(source)
          copy.name = {
            en: copyName(source.name.en, list.filter(form => !form.built_in).map(form => form.name.en)),
            ka: source.name.ka ? `${source.name.ka} (ასლი)` : "",
          }
          if (cancelled) return
          setDetail(null); setDraft(copy); setSaved(null); setOpenItems(new Set())
        } else if (formId === "new") {
          const blank = blankDraft()
          if (cancelled) return
          setDetail(null); setDraft(blank); setSaved(JSON.stringify(blank))
          setOpenItems(new Set(blank.parts.flatMap(part => part.items.map(item => item.id))))
        } else {
          const form = await formsApi.get(org.id, formId)
          if (cancelled) return
          const loaded = toDraft(form)
          setDetail(form); setDraft(loaded); setSaved(JSON.stringify(loaded)); setOpenItems(new Set())
        }
        if (cancelled) return
        // Marked only once it's here: React runs effects twice in development, and the first run is cancelled
        loadedFor.current = loadKey
        setLoadError(""); setShowProblems(false); setSaveError(""); setTab("edit")
      } catch (cause) {
        if (cancelled) return
        setLoadError(cause instanceof ApiError && cause.status === 404 ? "This form doesn't exist, or it was removed." : cause instanceof ApiError ? cause.message : "The form couldn't be loaded.")
      }
    })()
    return () => { cancelled = true }
  }, [org, formId, copyOf, loadKey])

  const readOnly = detail !== null && !detail.can_edit
  const dirty = !readOnly && draft !== null && JSON.stringify(draft) !== saved
  const problems = useMemo(() => (draft && showProblems ? validate(draft) : {}), [draft, showProblems])
  const problemCount = Object.keys(problems).length
  const preview = useMemo(() => (draft ? toInput(draft) : null), [draft])

  // Unsaved changes: the browser asks before closing the tab or reloading, and PEA before going to another page
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)

  async function save() {
    if (!org || !draft || saving || readOnly) return
    const found = validate(draft)
    setShowProblems(true)
    if (Object.keys(found).length > 0) {
      const count = Object.keys(found).length
      setSaveError(`${count === 1 ? "One thing needs" : `${count} things need`} fixing before the form can be saved; they're marked below.`)
      setTab("edit")
      // Open the items that have problems, so their fields can be seen
      const ids = draft.parts.flatMap(part => part.items.map(item => item.id)).filter(id => Object.keys(found).some(key => key.startsWith(`${id}.`)))
      setOpenItems(current => new Set([...current, ...ids]))
      return
    }
    setSaving(true)
    setSaveError("")
    try {
      const input = toInput(draft)
      const result = detail ? await formsApi.update(org.id, detail.id, input) : await formsApi.create(org.id, input)
      const next = toDraft(result)
      flushSync(() => {
        setDetail(result); setDraft(next); setSaved(JSON.stringify(next)); setShowProblems(false); setJustSaved(true)
      })
      if (formId === "new") {
        loadedFor.current = `${org.id}:${result.id}:`
        navigate(editorPath(org.id, result.id), { replace: true })
      }
    } catch (cause) {
      setSaveError(cause instanceof ApiError ? cause.message : "The form couldn't be saved. Try again.")
    } finally {
      setSaving(false)
    }
  }

  // Ctrl+S / ⌘S saves the form instead of opening the browser's "save page" dialog
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  useEffect(() => {
    if (!justSaved) return
    const timer = window.setTimeout(() => setJustSaved(false), 4000)
    return () => window.clearTimeout(timer)
  }, [justSaved])

  const change = (next: Draft) => { setDraft(next); setJustSaved(false) }
  const updatePart = (id: string, next: DraftPart) => draft && change({ ...draft, parts: draft.parts.map(part => (part.id === id ? next : part)) })
  const movePart = (from: number, by: -1 | 1) => {
    if (!draft) return
    const parts = [...draft.parts]
    const [moved] = parts.splice(from, 1)
    parts.splice(from + by, 0, moved)
    change({ ...draft, parts })
  }
  const removePart = (id: string) => draft && change({ ...draft, parts: draft.parts.filter(part => part.id !== id) })
  const addPart = () => {
    if (!draft) return
    const part = newPart(NUMERALS[draft.parts.length] ?? "")
    part.items[0].code = `${draft.parts.length + 1}.1`
    change({ ...draft, parts: [...draft.parts, part] })
    setOpenItems(current => new Set([...current, part.items[0].id]))
  }
  const addItem = (partIndex: number) => {
    if (!draft) return
    const part = draft.parts[partIndex]
    const item = newItem()
    item.code = `${partIndex + 1}.${part.items.length + 1}`
    updatePart(part.id, { ...part, items: [...part.items, item] })
    setOpenItems(current => new Set([...current, item.id]))
  }
  const toggleItem = (id: string) => setOpenItems(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const title = draft?.name.en.trim() || (detail ? detail.name.en : formId === "new" ? "New form" : "Evaluation form")
  const breadcrumb = [{ label: "Evaluation forms", to: "/admin/evaluation-forms" }, { label: title }]
  const itemCount = draft?.parts.reduce((sum, part) => sum + part.items.length, 0) ?? 0
  const status = saving ? "Saving…" : saveError && problemCount === 0 ? "Not saved" : dirty ? (saved === null ? "Not saved yet" : "Unsaved changes") : justSaved ? "Saved" : ""

  return (
    <WorkspaceLayout breadcrumb={breadcrumb}>
      {() => (
        <div className="dashboard-content form-editor">
          <div className="page-heading">
            <div>
              <h1>{title}</h1>
              <p>{draft ? `${countLabel(draft.parts.length, itemCount)}${draft.total_minimum.trim() ? ` · at least ${pts(Number(draft.total_minimum) || 0)} in total` : ""}` : " "}</p>
            </div>
            <div className="page-actions">
              {readOnly ? (
                <>
                  <span className="form-readonly-badge"><Lock aria-hidden="true" />{detail?.built_in ? "Built-in form" : "Read only"}</span>
                  {org && detail && <Button className="dashboard-button" onClick={() => navigate(editorPath(org.id, "new", detail.id))}><Copy />Make a copy</Button>}
                </>
              ) : draft && (
                <>
                  <span className={`form-save-status ${dirty ? "unsaved" : ""}`} role="status">
                    {status === "Saved" && <Check aria-hidden="true" />}{status}
                  </span>
                  {/* A form that was never saved (new, or a copy): back to the list. Unsaved changes ask first (useBlocker). */}
                  {formId === "new" && <Button variant="outline" className="dashboard-button" disabled={saving} onClick={() => navigate("/admin/evaluation-forms")}>Cancel</Button>}
                  <Button className="dashboard-button" disabled={saving || (!dirty && saved !== null)} onClick={() => void save()} title="Save (Ctrl+S)">
                    <Save />{saving ? "Saving…" : "Save"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {loadError && <p className="form-error-summary" role="alert">{loadError} <Button variant="link" onClick={() => navigate("/admin/evaluation-forms")}>Back to the forms</Button></p>}
          {!draft && !loadError && <p role="status">Loading the form…</p>}

          {draft && preview && (readOnly ? (
            <>
              <p className="form-readonly-note">
                {detail?.built_in
                  ? "This is the built-in ISU form, so it can't be changed. Make a copy to adapt it for your department."
                  : "You can see this form but not change it. Make a copy to adapt it."}
              </p>
              <FormPreview form={preview} />
            </>
          ) : (
            <>
              <div className="segmented" role="tablist" aria-label="Form editor">
                <button type="button" role="tab" aria-selected={tab === "edit"} aria-checked={tab === "edit"} onClick={() => setTab("edit")}>Edit</button>
                <button type="button" role="tab" aria-selected={tab === "preview"} aria-checked={tab === "preview"} onClick={() => setTab("preview")}>Preview</button>
              </div>

              {saveError && <p className="form-error-summary" role="alert">{saveError}</p>}

              {tab === "preview" ? <FormPreview form={preview} /> : (
                <>
                  <section className="dashboard-card" aria-labelledby="form-about-heading">
                    <div className="card-heading"><h2 id="form-about-heading">About this form</h2></div>
                    <div className="form-grid">
                      <Field id="form-name" label="Name (English)" span={2} required value={draft.name.en} error={problems.name} placeholder="Department of Computer Science evaluation" onChange={en => change({ ...draft, name: { ...draft.name, en } })} />
                      <Field id="form-name-ka" label="Name (Georgian)" span={2} lang="ka" value={draft.name.ka} onChange={ka => change({ ...draft, name: { ...draft.name, ka } })} />
                      <Field id="form-description" label="Description" span={4} multiline maxLength={LIMITS.description} value={draft.description}
                        placeholder="Who it's for and what it covers" onChange={description => change({ ...draft, description })} />
                      <Field id="form-total-minimum" label="Points needed in total" span={1} numeric value={draft.total_minimum} error={problems.total_minimum} placeholder="None" onChange={total_minimum => change({ ...draft, total_minimum })} />
                    </div>
                  </section>

                  {problems.parts && <p className="field-error" role="alert">{problems.parts}</p>}
                  {draft.parts.map((part, index) => (
                    <PartEditor
                      key={part.id}
                      part={part}
                      index={index}
                      count={draft.parts.length}
                      problems={problems}
                      openItems={openItems}
                      onToggleItem={toggleItem}
                      onChange={next => updatePart(part.id, next)}
                      onMove={by => movePart(index, by)}
                      onRemove={() => (part.items.some(item => item.name.en.trim()) ? setRemovingPart(part) : removePart(part.id))}
                      onAddItem={() => addItem(index)}
                    />
                  ))}
                  <Button variant="outline" className="dashboard-button form-add-part" disabled={draft.parts.length >= LIMITS.parts} onClick={addPart}><Plus />Add part</Button>
                </>
              )}
            </>
          ))}

          <ConfirmDialog
            open={removingPart !== null}
            title={`Remove ${removingPart?.name.en.trim() || "this part"}?`}
            description={`Its ${removingPart?.items.length === 1 ? "item goes" : `${removingPart?.items.length} items go`} with it. Nothing changes until you save.`}
            confirmLabel="Remove part"
            danger
            onConfirm={() => { if (removingPart) removePart(removingPart.id); setRemovingPart(null) }}
            onCancel={() => setRemovingPart(null)}
          />
          <ConfirmDialog
            open={blocker.state === "blocked"}
            title="Leave without saving?"
            description="This form has changes that aren't saved yet. If you leave now, they're lost."
            confirmLabel="Leave without saving"
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
