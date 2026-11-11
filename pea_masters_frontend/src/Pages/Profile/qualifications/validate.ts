import type { SaveMode } from "./qualifications-store"
import { allFields, type EntryValues, type SectionDef } from "./sections"

/** "gnsf.ge/x" → "https://gnsf.ge/x" so people don't have to type the protocol */
export const withProtocol = (value: string) => /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`

function isValidUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/** Returns field name → error message. Drafts only need the title field. */
export function validateEntry(section: SectionDef, values: EntryValues, mode: SaveMode) {
  const fields = allFields(section)
  const errors: Record<string, string> = {}
  const required = mode === "draft" ? fields.filter(field => field.name === section.titleField) : fields.filter(field => field.required)
  for (const field of required) {
    if (!values[field.name]?.trim()) errors[field.name] = `${field.label} is required.`
  }
  for (const field of fields) {
    const value = values[field.name]?.trim()
    if (field.type === "url" && value && !isValidUrl(withProtocol(value))) errors[field.name] = "Enter a valid web address, e.g. https://example.org"
  }
  for (const [first, second] of section.dateOrder ?? []) {
    if (values[first] && values[second] && values[second] < values[first] && !errors[second]) {
      const label = (name: string) => fields.find(field => field.name === name)?.label.toLowerCase() ?? name
      errors[second] = `Can't be before the ${label(first)}.`
    }
  }
  return errors
}

/** Trims values, drops empty ones and adds https:// to URLs */
export function cleanValues(section: SectionDef, values: EntryValues): EntryValues {
  const urlFields = new Set(allFields(section).filter(field => field.type === "url").map(field => field.name))
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value && value !== "https://")
      .map(([key, value]) => [key, urlFields.has(key) ? withProtocol(value) : value]),
  )
}
