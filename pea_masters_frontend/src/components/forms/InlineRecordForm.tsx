import { useEffect, useRef, useState, type FormEvent } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FormField } from "./FormField"
import type { FieldDef } from "./field-types"
import "./forms.css"

type Values = Record<string, string>

/** An editor in the list section, with the existing records still visible below. */
export function InlineRecordForm({ title, description, fields, initialValues, submitLabel, onSave, onCancel, validate, idPrefix }: {
  title: string
  description: string
  fields: FieldDef[]
  initialValues: Values
  submitLabel: string
  onSave: (values: Values) => void
  onCancel: () => void
  validate?: (values: Values) => Record<string, string>
  idPrefix: string
}) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    formRef.current?.querySelector<HTMLElement>("input, select, textarea")?.focus({ preventScroll: true })
  }, [])

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = Object.fromEntries(Object.entries(values).map(([name, value]) => [name, value.trim()]))
    const found: Record<string, string> = {}
    for (const field of fields) if (field.required && !trimmed[field.name]) found[field.name] = `${field.label} is required.`
    Object.assign(found, Object.fromEntries(Object.entries(validate?.(trimmed) ?? {}).filter(([name]) => !found[name])))
    setErrors(found)
    const invalid = fields.find(field => found[field.name])
    if (invalid) { formRef.current?.querySelector<HTMLElement>(`#${idPrefix}-${invalid.name}`)?.focus(); return }
    onSave(trimmed)
  }

  return <form ref={formRef} className="inline-record-form" aria-labelledby={`${idPrefix}-editor-title`} noValidate onSubmit={submit}>
    <div className="inline-record-heading"><div><h3 id={`${idPrefix}-editor-title`}>{title}</h3><p>{description}</p></div><Button type="button" variant="ghost" size="icon-sm" aria-label={`Cancel ${title.toLowerCase()}`} onClick={onCancel}><X /></Button></div>
    <div className="form-grid">{fields.map(field => <FormField key={field.name} idPrefix={idPrefix} field={field} value={values[field.name] ?? ""} error={errors[field.name]} onChange={value => {
      setValues(current => ({ ...current, [field.name]: value }))
      if (errors[field.name]) setErrors(current => { const next = { ...current }; delete next[field.name]; return next })
    }} />)}</div>
    <div className="inline-record-actions"><Button type="button" variant="outline" className="dashboard-button" onClick={onCancel}>Cancel</Button><Button type="submit" className="dashboard-button">{submitLabel}</Button></div>
  </form>
}
