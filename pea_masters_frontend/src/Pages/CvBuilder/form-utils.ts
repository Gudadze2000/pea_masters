import type { CvData } from "./cv-model"

/** Props shared by the editor tabs */
export type ChangeCv = (update: (current: CvData) => CvData) => void

/** aria-describedby for a control rendered inside <Field> */
export const describedBy = (id: string, error?: string | null, hint?: string) => error ? `${id}-error` : hint ? `${id}-hint` : undefined

const currentYear = new Date().getFullYear()

/** Publication or talk year: four digits, not further than next year */
export function yearError(value: string, required = false) {
  if (!value) return required ? "Year is required." : null
  if (!/^\d{4}$/.test(value)) return "Use four digits, e.g. 2024."
  const year = Number(value)
  if (year < 1900 || year > currentYear + 1) return `Enter a year between 1900 and ${currentYear + 1}.`
  return null
}

/** Triggers a browser download of a text file */
export function downloadText(filename: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
