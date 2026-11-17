import { useEffect, useState } from "react"
import { AlertTriangle, LoaderCircle } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { useLanguage } from "@/lib/language-context"
import { groupByFaculty, localName, type LocalizedName, type Unit } from "@/lib/people"
import { PUBLICATION_YEARS } from "@/Pages/EvaluationForm/evaluation-model"

/** GET /api/v1/orgs/{org}/research-output (app/research_output.py) */
type PersonOutput = {
  user_id: string
  name: string
  department: LocalizedName | null
  researcher_id: string | null
  orcid: string | null
  documents: number | null
  times_cited: number | null
  h_index: number | null
  by_year: Record<string, number>
  error: string | null
}
type ResearchOutput = {
  from_year: number
  to_year: number
  people: PersonOutput[]
  documents: number
  by_year: Record<string, number>
  without_identifiers: number
  checked_at: string | null
}

type State = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; output: ResearchOutput }

const FIRST_YEAR = 2015
const thisYear = new Date().getFullYear()
const YEARS = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => thisYear - i)

/**
 * Web of Science output of the people the viewer manages, per person and per year. Admins pick the whole organization,
 * a faculty or a department; heads of department see their own department.
 */
export function ResearchOutputPanel({ orgId, units, canPickUnit }: { orgId: string; units: Unit[]; canPickUnit: boolean }) {
  const { language } = useLanguage()
  const [from, setFrom] = useState(PUBLICATION_YEARS.from)
  const [to, setTo] = useState(Math.min(PUBLICATION_YEARS.to, thisYear))
  const [unitId, setUnitId] = useState("")
  const [state, setState] = useState<State>({ status: "loading" })
  const [request, setRequest] = useState("")

  // Each change of filters starts a new request; the latest one wins
  const key = `${orgId}|${from}|${to}|${unitId}`
  useEffect(() => {
    let cancelled = false
    const query = new URLSearchParams({ from_year: String(from), to_year: String(to), ...(unitId ? { unit_id: unitId } : {}) })
    api<ResearchOutput>(`/orgs/${orgId}/research-output?${query}`)
      .then(output => { if (!cancelled) { setState({ status: "ready", output }); setRequest(key) } })
      .catch((cause: unknown) => { if (!cancelled) { setState({ status: "error", message: cause instanceof ApiError ? cause.message : "The overview couldn't be loaded." }); setRequest(key) } })
    return () => { cancelled = true }
  }, [orgId, from, to, unitId, key])
  const loading = request !== key

  const years = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const groups = groupByFaculty(units, language)

  return (
    <section className="dashboard-card research-output" aria-labelledby="research-output-heading">
      <div className="card-heading research-output-heading">
        <div>
          <h2 id="research-output-heading">Research output</h2>
          <p className="card-subtitle">Web of Science documents, found by each person's ResearcherID or ORCID iD. Updated daily.</p>
        </div>
        <div className="research-output-filters">
          {canPickUnit && (
            <select className="form-control" aria-label="Faculty or department" value={unitId} onChange={event => setUnitId(event.target.value)}>
              <option value="">Whole organization</option>
              {groups.map(group => group.faculty ? (
                <optgroup key={group.faculty.id} label={localName(group.faculty.name, language)}>
                  <option value={group.faculty.id}>All of {localName(group.faculty.name, language)}</option>
                  {group.departments.map(unit => <option key={unit.id} value={unit.id}>{localName(unit.name, language)}</option>)}
                </optgroup>
              ) : group.departments.map(unit => <option key={unit.id} value={unit.id}>{localName(unit.name, language)}</option>))}
            </select>
          )}
          <select className="form-control" aria-label="From year" value={from} onChange={event => { const year = Number(event.target.value); setFrom(year); if (year > to) setTo(year) }}>
            {YEARS.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
          <span aria-hidden="true">–</span>
          <select className="form-control" aria-label="To year" value={to} onChange={event => { const year = Number(event.target.value); setTo(year); if (year < from) setFrom(year) }}>
            {YEARS.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
        </div>
      </div>

      {loading && <p className="research-output-status" role="status"><LoaderCircle className="wos-spin" aria-hidden="true" />Collecting documents from Web of Science… The first time can take a moment per person.</p>}
      {!loading && state.status === "error" && <p className="form-error-summary" role="alert">{state.message}</p>}
      {!loading && state.status === "ready" && <Overview output={state.output} years={years} language={language} />}
    </section>
  )
}

function Overview({ output, years, language }: { output: ResearchOutput; years: number[]; language: "KA" | "EN" }) {
  const counted = output.people.filter(person => person.documents !== null)
  return <>
    <dl className="research-output-totals">
      <div><dt>Documents</dt><dd>{output.documents}</dd></div>
      {years.map(year => <div key={year}><dt>{year}</dt><dd>{output.by_year[year] ?? 0}</dd></div>)}
      <div><dt>People counted</dt><dd>{counted.length} of {output.people.length}</dd></div>
    </dl>
    <p className="research-output-note">Totals count an article by several colleagues once; each person's row counts it for them.</p>
    {output.without_identifiers > 0 && <p className="research-output-warning"><AlertTriangle aria-hidden="true" />{output.without_identifiers} {output.without_identifiers === 1 ? "person has" : "people have"} no ResearcherID or ORCID iD on their profile, so their documents can't be counted. They can add one in My profile → Research identifiers.</p>}
    <div className="data-table-wrap">
      <table className="data-table research-output-table">
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Department</th>
            <th scope="col" className="num">Documents</th>
            {years.map(year => <th key={year} scope="col" className="num">{year}</th>)}
            <th scope="col" className="num">Cited</th>
            <th scope="col" className="num" title="Calculated by PEA from these documents only">h-index</th>
          </tr>
        </thead>
        <tbody>
          {output.people.length === 0
            ? <tr><td colSpan={5 + years.length} className="data-table-empty">No one here yet.</td></tr>
            : output.people.map(person => (
              <tr key={person.user_id}>
                <th scope="row">
                  <span className="research-output-name">{person.name}</span>
                  <small>{person.researcher_id ?? person.orcid ?? "No identifier"}</small>
                </th>
                <td>{person.department ? localName(person.department, language) : "—"}</td>
                {person.documents === null
                  ? <td colSpan={3 + years.length} className="research-output-missing">{person.error ?? "Not counted: no ResearcherID or ORCID iD"}</td>
                  : <>
                    <td className="num">{person.documents}</td>
                    {years.map(year => <td key={year} className="num">{person.by_year[year] ?? 0}</td>)}
                    <td className="num">{person.times_cited}</td>
                    <td className="num">{person.h_index}</td>
                  </>}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  </>
}
