import type { EvaluationFormDetail, FormInput, FormItem, FormPart, Localized } from "@/lib/evaluations"

/*
 * The form editor works on a draft: the same shape as the server's form, except that numbers are kept as the text
 * typed into their fields (so "" means "no limit" and a half-typed "1." isn't lost). toInput turns it back.
 */

export type DraftItem = Omit<FormItem, "points" | "max_points" | "max_entries" | "variable_points"> & {
  points: string
  max_points: string
  max_entries: string
  /** Entries state their own points; `rule` explains how */
  variable: boolean
  rule: string
}

export type DraftPart = Omit<FormPart, "min" | "cap" | "items"> & { min: string; cap: string; items: DraftItem[] }

export type Draft = { name: Localized; description: string; total_minimum: string; parts: DraftPart[] }

/** Limits the server checks too (app/evaluations.py) */
export const LIMITS = { parts: 20, items: 200, text: 300, long: 1000, description: 2000, points: 1000, maxPoints: 10000, entries: 100 }

const text = (value: number | null) => (value === null ? "" : String(value))

/** Ids only need to be unique inside the form; lower-case letters, digits and dashes, as the server expects */
function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function newItem(): DraftItem {
  return {
    id: newId("item"), code: "", name: { en: "", ka: "" }, points: "", max_points: "", max_entries: "",
    variable: false, rule: "", hint: "", icon: "imgIconFile1",
  }
}

export function newPart(numeral = ""): DraftPart {
  return { id: newId("part"), numeral, name: { en: "", ka: "" }, rule: "", min: "", cap: "", items: [newItem()] }
}

export function blankDraft(): Draft {
  const part = newPart("I")
  part.items[0].code = "1.1"
  return { name: { en: "", ka: "" }, description: "", total_minimum: "", parts: [part] }
}

export function toDraft(form: Pick<EvaluationFormDetail, "name" | "description" | "structure">): Draft {
  return {
    name: { ...form.name },
    description: form.description,
    total_minimum: text(form.structure.total_minimum),
    parts: form.structure.parts.map(part => ({
      ...part,
      name: { ...part.name },
      min: text(part.min),
      cap: text(part.cap),
      items: part.items.map(item => ({
        ...item,
        name: { ...item.name },
        points: text(item.points),
        max_points: text(item.max_points),
        max_entries: text(item.max_entries),
        variable: item.variable_points !== null,
        rule: item.variable_points ?? "",
      })),
    })),
  }
}

const number = (value: string) => (value.trim() === "" ? null : Number(value))
const tidy = (value: string) => value.trim().replace(/\s+/g, " ")

export function toInput(draft: Draft): FormInput {
  return {
    name: { en: tidy(draft.name.en), ka: tidy(draft.name.ka) },
    description: draft.description.trim(),
    structure: {
      version: 1,
      total_minimum: number(draft.total_minimum),
      parts: draft.parts.map(part => ({
        id: part.id, numeral: part.numeral.trim(), name: { en: tidy(part.name.en), ka: tidy(part.name.ka) },
        rule: part.rule.trim(), min: number(part.min), cap: number(part.cap),
        items: part.items.map(item => ({
          id: item.id, code: item.code.trim(), name: { en: tidy(item.name.en), ka: tidy(item.name.ka) },
          points: number(item.points) ?? 0, max_points: number(item.max_points), max_entries: number(item.max_entries),
          variable_points: item.variable ? item.rule.trim() : null, hint: item.hint.trim(), icon: item.icon,
        })),
      })),
    },
  }
}

/** What's wrong, keyed by field: "name", "total_minimum", "<part id>.name", "<item id>.points", ... */
export type Problems = Record<string, string>

function checkNumber(problems: Problems, key: string, value: string, { min = 0, max, whole = false, required = false }:
  { min?: number; max: number; whole?: boolean; required?: boolean }) {
  if (value.trim() === "") {
    if (required) problems[key] = "Required."
    return
  }
  const n = Number(value)
  if (!Number.isFinite(n)) problems[key] = "Enter a number."
  else if (whole && !Number.isInteger(n)) problems[key] = "Enter a whole number."
  else if (n < min) problems[key] = `Can't be less than ${min}.`
  else if (n > max) problems[key] = `Can't be more than ${max}.`
}

export function validate(draft: Draft): Problems {
  const problems: Problems = {}
  if (!draft.name.en.trim()) problems.name = "Give the form a name."
  checkNumber(problems, "total_minimum", draft.total_minimum, { max: 100000 })
  if (draft.parts.length === 0) problems.parts = "A form needs at least one part."
  if (draft.parts.length > LIMITS.parts) problems.parts = `A form can have at most ${LIMITS.parts} parts.`
  for (const part of draft.parts) {
    if (!part.name.en.trim()) problems[`${part.id}.name`] = "Give the part a name."
    checkNumber(problems, `${part.id}.min`, part.min, { max: 100000 })
    checkNumber(problems, `${part.id}.cap`, part.cap, { max: 100000 })
    if (!problems[`${part.id}.cap`] && part.min.trim() && part.cap.trim() && Number(part.cap) < Number(part.min)) {
      problems[`${part.id}.cap`] = "Can't be less than the minimum."
    }
    if (part.items.length === 0) problems[`${part.id}.items`] = "Add at least one item, or remove the part."
    if (part.items.length > LIMITS.items) problems[`${part.id}.items`] = `A part can have at most ${LIMITS.items} items.`
    for (const item of part.items) {
      if (!item.name.en.trim()) problems[`${item.id}.name`] = "Give the item a name."
      checkNumber(problems, `${item.id}.points`, item.points, { max: LIMITS.points, required: true })
      checkNumber(problems, `${item.id}.max_points`, item.max_points, { max: LIMITS.maxPoints })
      checkNumber(problems, `${item.id}.max_entries`, item.max_entries, { min: 1, max: LIMITS.entries, whole: true })
      if (item.variable && !item.rule.trim()) problems[`${item.id}.rule`] = "Explain how the points are worked out."
    }
  }
  return problems
}

/** "ISU self-assessment (copy)", or "(copy 2)" if that's taken */
export function copyName(name: string, taken: string[]) {
  const lower = new Set(taken.map(value => value.trim().toLowerCase()))
  let candidate = `${name} (copy)`
  for (let n = 2; lower.has(candidate.toLowerCase()); n++) candidate = `${name} (copy ${n})`
  return candidate
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export const countLabel = (parts: number, items: number) => `${plural(parts, "part")} · ${plural(items, "item")}`

/** Points as people read them: 50, 2.5 */
export const pts = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)} pts`
