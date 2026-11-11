import { useRef, useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RecordSheet } from "@/components/forms/RecordSheet"
import type { FieldDef } from "@/components/forms/field-types"
import { TALK_TYPES, type CvData, type Talk } from "./cv-model"
import type { ChangeCv } from "./form-utils"

const talkFields: FieldDef[] = [
  { name: "title", label: "Title of the talk", type: "text", required: true },
  { name: "type", label: "Type", type: "select", required: true, span: 2, options: TALK_TYPES },
  { name: "date", label: "Month", type: "text", required: true, span: 2, placeholder: "2024-07", hint: "Year and month, e.g. 2024-07." },
  { name: "event", label: "Event", type: "text", required: true, placeholder: "e.g. European Plant Science Conference" },
  { name: "location", label: "City and country", type: "text", placeholder: "e.g. Tbilisi, Georgia" },
]

/** "2024-07" → "Jul 2024" */
const monthLabel = (value: string) => {
  const [year, month] = value.split("-").map(Number)
  return year && month ? new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : value
}

/** "Talks" tab: conference talks, keynotes, seminars and posters. */
export function TalksTab({ cv, change }: { cv: CvData; change: ChangeCv }) {
  const [editor, setEditor] = useState<{ id: string | null; session: number } | null>(null)
  const [open, setOpen] = useState(false)
  const session = useRef(0)
  const editing = editor?.id ? cv.talks.find(talk => talk.id === editor.id) : undefined

  const openEditor = (id: string | null) => {
    session.current += 1
    setEditor({ id, session: session.current })
    setOpen(true)
  }

  return (
    <div className="cv-tab-panel">
      <section className="dashboard-card cv-card" aria-labelledby="cv-talks-heading">
        <div className="card-heading cv-card-heading-wrap">
          <h2 id="cv-talks-heading">Talks &amp; presentations <span className="count-badge">{cv.talks.length}</span></h2>
          <Button className="dashboard-button compact" onClick={() => openEditor(null)}><Plus />Add talk</Button>
        </div>
        <div className="data-table-wrap">
          <table className="data-table cv-talks-table">
            <thead>
              <tr><th scope="col">Title</th><th scope="col">Event</th><th scope="col">Date</th><th scope="col">Type</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {cv.talks.length === 0
                ? <tr><td colSpan={5} className="data-table-empty">No talks yet. Use “Add talk” to add invited talks, keynotes and posters.</td></tr>
                : [...cv.talks].sort((a, b) => b.date.localeCompare(a.date)).map(talk => (
                  <tr key={talk.id}>
                    <td>{talk.title}</td>
                    <td>{talk.event}{talk.location && <span className="cv-cell-sub">{talk.location}</span>}</td>
                    <td className="nowrap">{monthLabel(talk.date)}</td>
                    <td><span className={`type-pill ${talk.type === "Keynote" || talk.type === "Invited talk" ? "international" : "local"}`}>{talk.type}</span></td>
                    <td>
                      <div className="row-actions">
                        <Button variant="outline" size="icon" className="icon-button" aria-label={`Edit ${talk.title}`} onClick={() => openEditor(talk.id)}><Pencil /></Button>
                        <Button variant="outline" size="icon" className="icon-button danger" aria-label={`Delete ${talk.title}`} onClick={() => change(current => ({ ...current, talks: current.talks.filter(item => item.id !== talk.id) }))}><Trash2 /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {editor && (
        <RecordSheet
          open={open}
          onOpenChange={setOpen}
          formKey={editor.session}
          idPrefix="talk"
          title={editing ? "Edit talk" : "Add talk"}
          description="Invited talks, keynotes, contributed talks, seminars and posters."
          fields={talkFields}
          initialValues={editing ? { ...editing } : { type: "Invited talk" }}
          submitLabel={editing ? "Save talk" : "Add talk"}
          validate={(values): Record<string, string> => {
            if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(values.date)) return { date: "Use year and month, e.g. 2024-07." }
            return Number(values.date.slice(0, 4)) > new Date().getFullYear() + 2 ? { date: "This date is too far in the future." } : {}
          }}
          onSave={values => {
            const talk: Talk = {
              id: editing?.id ?? crypto.randomUUID(),
              title: values.title, event: values.event, location: values.location ?? "", date: values.date, type: values.type as Talk["type"],
            }
            change(current => ({ ...current, talks: editing ? current.talks.map(item => item.id === talk.id ? talk : item) : [talk, ...current.talks] }))
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}
