import { useRef, useState, type FormEvent } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { FormField } from "./FormField"
import type { FieldDef } from "./field-types"
import "./forms.css"

type Values = Record<string, string>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  fields: FieldDef[]
  initialValues: Values
  submitLabel: string
  onSave: (values: Values) => void
  /** Extra checks on top of "required"; return field name → message */
  validate?: (values: Values) => Record<string, string>
  /** Changes every time the sheet is opened, so the form starts fresh */
  formKey: number
  idPrefix: string
}

/** Right-hand side panel with a small form, used for adding/editing table rows. */
export function RecordSheet({ open, onOpenChange, title, description, ...formProps }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="form-sheet" showCloseButton={false}>
        <div className="form-sheet-header">
          <div>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </div>
          <SheetClose render={<Button variant="outline" size="icon" className="icon-button" aria-label="Close" />}><X /></SheetClose>
        </div>
        <RecordForm key={formProps.formKey} {...formProps} onCancel={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  )
}

function RecordForm({ fields, initialValues, submitLabel, onSave, validate, idPrefix, onCancel }: Omit<Props, "open" | "onOpenChange" | "title" | "description" | "formKey"> & { onCancel: () => void }) {
  const [values, setValues] = useState<Values>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const formRef = useRef<HTMLFormElement>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]))
    const found: Record<string, string> = {}
    for (const field of fields) if (field.required && !trimmed[field.name]) found[field.name] = `${field.label} is required.`
    Object.assign(found, Object.fromEntries(Object.entries(validate?.(trimmed) ?? {}).filter(([name]) => !found[name])))
    setErrors(found)
    const firstInvalid = fields.find(field => found[field.name])
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`#${idPrefix}-${firstInvalid.name}`)?.focus()
      return
    }
    onSave(trimmed)
  }

  return (
    <form ref={formRef} className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={submit}>
      <div className="form-sheet-body">
        <div className="form-grid">
          {fields.map(field => (
            <FormField
              key={field.name}
              idPrefix={idPrefix}
              field={field}
              value={values[field.name] ?? ""}
              error={errors[field.name]}
              onChange={value => {
                setValues(current => ({ ...current, [field.name]: value }))
                if (errors[field.name]) setErrors(current => { const next = { ...current }; delete next[field.name]; return next })
              }}
            />
          ))}
        </div>
      </div>
      <div className="form-sheet-footer">
        <Button type="button" variant="outline" className="dashboard-button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" className="dashboard-button">{submitLabel}</Button>
      </div>
    </form>
  )
}
