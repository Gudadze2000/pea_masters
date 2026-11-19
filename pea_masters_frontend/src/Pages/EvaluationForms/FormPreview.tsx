import { EvaluationIcon as Icon } from "@/Pages/EvaluationForm/EvaluationModal"
import type { FormInput } from "@/lib/evaluations"
import { pts } from "./form-draft"
import "@/Pages/EvaluationForm/EvaluationForm.css"

/** The form as researchers will see it, using the evaluation page's own cards (without entries). */
export function FormPreview({ form }: { form: FormInput }) {
  const { structure } = form
  return (
    <div className="form-preview">
      <div className="dashboard-card form-preview-intro">
        <h2>{form.name.en || "Untitled form"}</h2>
        {form.name.ka && <p lang="ka" className="muted">{form.name.ka}</p>}
        {form.description && <p>{form.description}</p>}
        <p className="form-preview-rules">
          {structure.total_minimum !== null ? `At least ${pts(structure.total_minimum)} in total.` : "No minimum total."}
          {structure.parts.filter(part => part.min !== null).map(part => ` At least ${pts(part.min!)} in ${part.name.en || "this part"}.`).join("")}
          {structure.parts.filter(part => part.cap !== null).map(part => ` ${part.name.en || "A part"} counts up to ${pts(part.cap!)}.`).join("")}
        </p>
      </div>

      {structure.parts.map(part => (
        <section key={part.id} className="evaluation-records" aria-label={part.name.en || "Part"}>
          <div className="evaluation-part-header">
            <div>
              <h2>{part.numeral && `${part.numeral}. `}{part.name.en || "Untitled part"}{part.name.ka && <small lang="ka">{part.name.ka}</small>}</h2>
              {part.rule && <p>{part.rule}</p>}
            </div>
            {part.min !== null ? (
              <div className="evaluation-part-score">
                <strong>{pts(part.min)}</strong>
                <span>needed{part.cap !== null ? ` · counts up to ${pts(part.cap)}` : ""}</span>
              </div>
            ) : part.cap !== null && (
              <div className="evaluation-part-score"><span>Counts up to {pts(part.cap)}</span></div>
            )}
          </div>
          {part.items.map(item => {
            const rate = item.variable_points !== null ? "Points per entry" : `${pts(item.points)} per entry`
            const limits = [item.max_points !== null && `max ${pts(item.max_points)}`, item.max_entries !== null && `up to ${item.max_entries} entries`].filter(Boolean).join(" · ")
            return (
              <section key={item.id} className="evaluation-record" aria-labelledby={`preview-${item.id}`}>
                <div className="evaluation-record-header">
                  <span className="evaluation-record-icon"><Icon name={item.icon} /></span>
                  <div className="evaluation-record-title">
                    <h2 id={`preview-${item.id}`}>{item.code && <span className="evaluation-record-code">{item.code}</span>}{item.name.en || "Untitled item"}</h2>
                    {item.name.ka && <small lang="ka">{item.name.ka}</small>}
                  </div>
                  <div className="evaluation-subtotal"><p>{rate}{limits && ` · ${limits}`}</p><strong>Subtotal: 0 pts</strong></div>
                </div>
                {(item.hint || item.variable_points) && (
                  <div className="form-preview-notes">
                    {item.variable_points && <p><strong>How points are worked out:</strong> {item.variable_points}</p>}
                    {item.hint && <p><strong>What to write:</strong> {item.hint}</p>}
                  </div>
                )}
              </section>
            )
          })}
        </section>
      ))}
    </div>
  )
}
