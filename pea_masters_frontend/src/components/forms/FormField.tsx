import type { FieldDef } from "./field-types"
import "./forms.css"

type Props = {
  field: FieldDef
  value: string
  error?: string
  onChange: (value: string) => void
  /** Prefix for the element id, so two forms on one page don't clash */
  idPrefix?: string
}

export function FormField({ field, value, error, onChange, idPrefix = "field" }: Props) {
  const id = `${idPrefix}-${field.name}`
  const describedBy = [field.hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined
  const common = {
    id,
    name: field.name,
    value,
    className: "form-control",
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    "aria-required": field.required || undefined,
  }

  return (
    <div className={`form-field span-${field.span ?? 4}`}>
      <label htmlFor={id}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label>
      {field.type === "textarea" ? (
        <textarea {...common} rows={field.rows ?? 4} placeholder={field.placeholder} onChange={e => onChange(e.target.value)} />
      ) : field.type === "select" ? (
        <select {...common} data-empty={!value || undefined} onChange={e => onChange(e.target.value)}>
          <option value="" disabled>Select…</option>
          {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          {...common}
          type={field.type}
          max={field.type === "date" ? "9999-12-31" : undefined}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
        />
      )}
      {field.hint && <p id={`${id}-hint`} className="field-hint">{field.hint}</p>}
      {error && <p id={`${id}-error`} className="field-error">{error}</p>}
    </div>
  )
}
