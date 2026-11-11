/** Describes one form field rendered by <FormField>. */
export type FieldDef = {
  name: string
  label: string
  type: "text" | "textarea" | "date" | "url" | "select"
  required?: boolean
  /** Columns out of 4 on desktop (default 4 = full width) */
  span?: 1 | 2 | 4
  hint?: string
  placeholder?: string
  options?: readonly string[]
  rows?: number
}
