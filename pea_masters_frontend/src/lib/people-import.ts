import type { Feature } from "write-excel-file/browser"
import type { Role } from "./auth"
import { api } from "./api"
import { nameFromEmail } from "./names"
import { groupByFaculty, localName, type Person, type Unit } from "./people"

/*
 * Registering and deactivating many people at once (app/people.py, POST /people/import). Admins act on anyone;
 * Coordinators register Researchers into their own department and deactivate their own Researchers.
 * The browser reads the .xlsx file here: the file never leaves the computer, only the checked rows are sent.
 * Formulas are never run: the reader takes the value Excel saved for each cell. Cells that start like a formula
 * (= + - @) are refused anyway, so they can't do harm if the list is ever opened in Excel again.
 * Every check here is repeated by the server; these only make the page helpful.
 */

export const IMPORT_LIMIT = 1000
const MAX_FILE_BYTES = 5 * 1024 * 1024
const FORMULA_START = /^[=+\-@]/

export type ImportRow = {
  key: string
  email: string
  /** Deactivate this (registered) person instead of registering them; only the email is needed then */
  deactivate: boolean
  name: string
  /** Unit ids; "" for none */
  facultyId: string
  departmentId: string
  roles: Role[]
  /** What the spreadsheet said, while it matches nothing in PEA */
  facultyText: string
  departmentText: string
  roleText: string
  deactivateText: string
  /** The row in the spreadsheet, for messages; null for rows added by hand */
  sheetRow: number | null
  /** The server's verdict from the last check; cleared when the row is edited */
  serverError: string | null
}

export type RowField = "email" | "name" | "faculty" | "department" | "roles" | "deactivate"
export type RowProblems = Partial<Record<RowField, string>>

/** Who is importing: Coordinators register Researchers into the departments they coordinate only */
export type Importer = {
  canManageRoles: boolean
  /** Departments a Coordinator coordinates */
  coordinated: string[]
  email: string
}

let nextKey = 0
/** A new row; a Coordinator's rows start in their department when they coordinate just one */
export function blankRow(units: Unit[] = [], importer?: Importer): ImportRow {
  nextKey += 1
  const own = importer && !importer.canManageRoles && importer.coordinated.length === 1 ? importer.coordinated[0] : ""
  return {
    key: `row-${nextKey}`, email: "", deactivate: false, name: "",
    facultyId: own ? units.find(unit => unit.id === own)?.parent_id ?? "" : "", departmentId: own, roles: ["member"],
    facultyText: "", departmentText: "", roleText: "", deactivateText: "", sheetRow: null, serverError: null,
  }
}

export const isBlank = (row: ImportRow) => !row.email.trim() && !row.name.trim() && !row.deactivate
  && !row.departmentText && !row.facultyText && !row.deactivateText

// --- reading the spreadsheet ---------------------------------------------------------------------

type Column = "email" | "name" | "faculty" | "department" | "role" | "deactivate"

/** Header titles accepted for each column, in English and Georgian (compared in lower case, without "(…)" or "*") */
const HEADERS: Record<Column, string[]> = {
  email: ["email", "e-mail", "email address", "university email", "ელფოსტა", "ელ. ფოსტა", "ელ.ფოსტა", "იმეილი"],
  name: ["name", "full name", "სახელი", "სახელი გვარი", "სახელი და გვარი"],
  faculty: ["faculty", "school", "ფაკულტეტი", "სკოლა"],
  department: ["department", "დეპარტამენტი"],
  role: ["role", "roles", "როლი", "როლები"],
  deactivate: ["deactivate", "deactivation", "დეაქტივაცია", "გააუქმე", "გაუქმება"],
}

const ROLE_WORDS: Record<string, Role> = {
  researcher: "member", member: "member", "მკვლევარი": "member",
  coordinator: "coordinator", head: "coordinator", "head of department": "coordinator", "კოორდინატორი": "coordinator",
  admin: "admin", administrator: "admin", "ადმინი": "admin", "ადმინისტრატორი": "admin",
}

/** The choices the template's role column offers (an Excel list can't hold commas, so "+" joins roles) */
const ROLE_CHOICES_ADMIN = ["Researcher", "Coordinator", "Admin", "Coordinator + Researcher", "Admin + Researcher"]
const ROLE_CHOICES_COORDINATOR = ["Researcher"]

const simplify = (text: string) => text.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim()
const headerTitle = (text: string) => simplify(text.replace(/\(.*?\)|\*/g, ""))

/** A cell as text; dates and numbers as they'd be typed. Control characters are dropped. */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim()
}

/** "Coordinator + Researcher" → roles; unknown words are returned so the row can say so */
export function parseRoles(text: string): { roles: Role[]; unknown: string } {
  const words = text.split(/[,;/+&]|\band\b/).map(simplify).filter(Boolean)
  if (words.length === 0) return { roles: ["member"], unknown: "" } // an empty cell means Researcher
  const roles = new Set<Role>()
  const unknown: string[] = []
  for (const word of words) {
    const role = ROLE_WORDS[word]
    if (role) roles.add(role)
    else unknown.push(word)
  }
  return { roles: (["admin", "coordinator", "member"] as Role[]).filter(role => roles.has(role)), unknown: unknown.join(", ") }
}

/** Finds a unit by its English or Georgian name, ignoring case and extra spaces */
function findByName(units: Unit[], text: string): Unit[] {
  const wanted = simplify(text)
  return units.filter(unit => Object.values(unit.name).some(name => simplify(name) === wanted))
}

/** Matches the faculty and department cells to PEA's structure; leaves the text where nothing matches */
export function matchUnits(units: Unit[], facultyText: string, departmentText: string) {
  const faculties = units.filter(unit => unit.kind === "faculty")
  const departments = units.filter(unit => unit.kind === "department")
  const result = { facultyId: "", departmentId: "", facultyText: "", departmentText: "" }

  const faculty = facultyText ? findByName(faculties, facultyText) : []
  if (facultyText && faculty.length === 0) result.facultyText = facultyText
  if (faculty.length === 1) result.facultyId = faculty[0].id

  if (departmentText) {
    const candidates = findByName(departments, departmentText)
      .filter(unit => !result.facultyId || unit.parent_id === result.facultyId)
    if (candidates.length === 1) {
      result.departmentId = candidates[0].id
      result.facultyId = candidates[0].parent_id ?? result.facultyId
    } else {
      result.departmentText = departmentText // none, or the same name in several faculties: the row says which
    }
  }
  return result
}

export class ImportFileError extends Error {}

/** Reads the first sheet of an .xlsx file into rows. The Excel reader is loaded only now. */
export async function readPeopleFile(file: File, units: Unit[], importer: Importer): Promise<ImportRow[]> {
  if (!/\.xlsx$/i.test(file.name)) throw new ImportFileError("Choose an Excel workbook (.xlsx). In Excel or Google Sheets, use Save as / Download → .xlsx.")
  if (file.size > MAX_FILE_BYTES) throw new ImportFileError("This file is larger than 5 MB. A list of 1000 people is far smaller: check it's the right file.")
  const { readSheet } = await import("read-excel-file/universal")
  let data: unknown[][]
  try {
    data = await readSheet(file) as unknown[][]
  } catch {
    throw new ImportFileError("Couldn't read this file. Open it in Excel, save it as an Excel workbook (.xlsx), and try again.")
  }

  const headerIndex = data.findIndex(row => row.some(cell => cellText(cell) !== ""))
  if (headerIndex < 0) throw new ImportFileError("The first sheet of this file is empty.")
  const header = data[headerIndex].map(cell => headerTitle(cellText(cell)))
  const columns = {} as Partial<Record<Column, number>>
  for (const column of Object.keys(HEADERS) as Column[]) {
    const index = header.findIndex(title => HEADERS[column].includes(title))
    if (index >= 0) columns[column] = index
  }
  if (columns.email === undefined) {
    throw new ImportFileError("The first row needs the column titles: email, name, faculty, department, role, deactivate. Download the template to see them.")
  }

  const rows: ImportRow[] = []
  data.slice(headerIndex + 1).forEach((cells, offset) => {
    const value = (column: Column) => (columns[column] === undefined ? "" : cellText(cells[columns[column]]))
    const email = value("email"), name = value("name"), faculty = value("faculty"), department = value("department")
    const deactivateCell = value("deactivate")
    if (!email && !name && !faculty && !department && !deactivateCell) return // empty line
    const { roles, unknown } = parseRoles(value("role"))
    const units_ = faculty || department ? matchUnits(units, faculty, department) : null
    const base = blankRow(units, importer) // a Coordinator's department when the cells are empty
    rows.push({
      ...base, email, name, roles, roleText: unknown, ...(units_ ?? {}),
      deactivate: simplify(deactivateCell) === "x", deactivateText: deactivateCell && simplify(deactivateCell) !== "x" ? deactivateCell : "",
      sheetRow: headerIndex + offset + 2,
    })
  })
  if (rows.length === 0) throw new ImportFileError("This file has the column titles but no people under them.")
  if (rows.length > IMPORT_LIMIT) {
    throw new ImportFileError(`This file lists ${rows.length} people. Use at most ${IMPORT_LIMIT} at a time: split the list into several files.`)
  }
  return rows
}

// --- checking ------------------------------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type CheckContext = {
  units: Unit[]
  /** Everyone the importer can see (Coordinators: their department), by email in lower case */
  registered: Map<string, Person>
  importer: Importer
  language: "KA" | "EN"
}

/** The problems of each row, by row key. Blank rows are ignored. */
export function checkRows(rows: ImportRow[], context: CheckContext): Map<string, RowProblems> {
  const { importer } = context
  const byKey = new Map<string, RowProblems>()
  const firstWithEmail = new Map<string, number>()
  const coordinatorOf = new Map<string, number>()
  const unitName = (id: string) => {
    const unit = context.units.find(item => item.id === id)
    return unit ? localName(unit.name, context.language) : "this department"
  }

  rows.forEach((row, index) => {
    if (isBlank(row)) return
    const problems: RowProblems = {}
    const email = row.email.trim().toLowerCase()
    const label = (at: number) => (rows[at].sheetRow ? `row ${rows[at].sheetRow}` : `line ${at + 1}`)
    const person = context.registered.get(email)

    if (!email) problems.email = "Email is required."
    else if (!EMAIL.test(email)) problems.email = "This isn't a valid email address."
    else if (firstWithEmail.has(email)) problems.email = `Also on ${label(firstWithEmail.get(email)!)}.`
    else if (row.deactivate) {
      if (!person) problems.email = `Nobody with this email is registered${importer.canManageRoles ? "" : " in your department"}.`
      else if (email === importer.email.toLowerCase()) problems.email = "You can't deactivate your own account."
      else if (person.status === "deactivated") problems.email = `${person.display_name} is already deactivated.`
      else if (!importer.canManageRoles && person.roles.some(role => role !== "member")) problems.email = "Coordinators can deactivate Researchers only. Ask an Admin."
    } else if (person) problems.email = `Already registered: ${person.display_name}. To deactivate them, tick Deactivate.`
    if (email && !firstWithEmail.has(email)) firstWithEmail.set(email, index)

    if (row.deactivateText) problems.deactivate = `Enter X or leave it empty, not “${row.deactivateText}”.`

    if (!row.deactivate) {
      const name = row.name.trim()
      if (FORMULA_START.test(name)) problems.name = "A name can't start with =, +, - or @."
      else if (!name && email && !nameFromEmail(email)) problems.name = "Enter their name: it can't be worked out from this email."

      if (row.facultyText) problems.faculty = `No faculty called “${row.facultyText}”. Choose one.`
      if (row.departmentText) {
        problems.department = context.units.filter(unit => unit.kind === "department"
          && Object.values(unit.name).some(n => simplify(n) === simplify(row.departmentText))).length > 1
          ? `“${row.departmentText}” is in several faculties. Choose the faculty.`
          : `No department called “${row.departmentText}”${row.facultyId ? " in this faculty" : ""}. Choose one.`
      } else if (row.facultyId && !row.departmentId) problems.department = "Choose a department: people belong to departments."
      else if (!importer.canManageRoles && !importer.coordinated.includes(row.departmentId)) {
        problems.department = "Choose your department: you can register Researchers in your own department only."
      }

      if (row.roleText) problems.roles = `Unknown role: “${row.roleText}”. Use Researcher, Coordinator or Admin.`
      else if (row.roles.length === 0) problems.roles = "Choose at least one role."
      else if (!importer.canManageRoles && row.roles.some(role => role !== "member")) problems.roles = "Coordinators can register Researchers only."
      else if (row.roles.includes("coordinator")) {
        const unit = context.units.find(item => item.id === row.departmentId)
        if (!row.departmentId) problems.roles = "A Coordinator needs the department they coordinate."
        else if (unit?.coordinator) problems.roles = `${unitName(row.departmentId)} already has a Coordinator: ${unit.coordinator.display_name}.`
        else if (coordinatorOf.has(row.departmentId)) problems.roles = `${label(coordinatorOf.get(row.departmentId)!)} already coordinates ${unitName(row.departmentId)}.`
        else coordinatorOf.set(row.departmentId, index)
      }
    }

    if (row.serverError && Object.keys(problems).length === 0) problems.email = row.serverError
    if (Object.keys(problems).length) byKey.set(row.key, problems)
  })
  return byKey
}

// --- sending -------------------------------------------------------------------------------------

export type ImportResult = { email: string; code: string | null; message: string | null }
export type ImportResponse = { results: ImportResult[]; errors: number; registered: number; deactivated: number }

export function toRequestRows(rows: ImportRow[]) {
  return rows.map(row => (row.deactivate
    ? { email: row.email.trim(), action: "deactivate" as const }
    : { email: row.email.trim(), action: "add" as const, display_name: row.name.trim() || null, roles: row.roles, department_id: row.departmentId || null }))
}

export const importApi = {
  run: (orgId: string, rows: ImportRow[], save: boolean) =>
    api<ImportResponse>(`/orgs/${orgId}/people/import`, { method: "POST", body: { rows: toRequestRows(rows), save } }),
}

// --- the template --------------------------------------------------------------------------------

const bold = (value: string) => ({ value, fontWeight: "bold" as const })
const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

type Dropdown = {
  /** Column letter on the People sheet */
  column: string
  /** Excel formula for the choices: a range on another sheet, or "\"a,b\"" for a fixed list */
  choices: string
  title: string
  prompt: string
  error: string
}

/**
 * Excel's dropdown lists ("data validation"): the arrow beside a cell, a short prompt when the cell is selected, and
 * a refusal of anything not in the list. write-excel-file has no option for them, so this adds the XML to the first
 * sheet (People) for every row a list may have.
 */
function dropdowns(lists: Dropdown[], utility: typeof import("write-excel-file/utility")): Feature<File | Blob | ArrayBuffer> {
  return {
    files: {
      transform: {
        "xl/worksheets/sheet{id}.xml": {
          transform: (xml, _options, { sheetIndex }) => {
            if (sheetIndex !== 0 || lists.length === 0) return xml
            const last = IMPORT_LIMIT + 1
            const markup = `<dataValidations count="${lists.length}">${lists.map(list =>
              `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorStyle="stop" `
              + `promptTitle="${escapeXml(list.title.slice(0, 32))}" prompt="${escapeXml(list.prompt.slice(0, 255))}" `
              + `errorTitle="${escapeXml(list.title.slice(0, 32))}" error="${escapeXml(list.error.slice(0, 255))}" `
              + `sqref="${list.column}2:${list.column}${last}"><formula1>${escapeXml(list.choices)}</formula1></dataValidation>`).join("")}</dataValidations>`
            // Excel refuses a file whose sheet elements are out of order: <dataValidations> goes after <sheetData> etc.
            return utility.insertElementMarkupAccordingToOrderOfSiblings(
              xml, markup, utility.getOrderOfSiblings("xl/worksheets/sheet{id}.xml", "worksheet") ?? [], "worksheet")
          },
        },
      },
    },
  }
}

/**
 * An .xlsx with the columns to fill in (with dropdowns), how to fill them in, and the faculties and departments.
 * A Coordinator's template lists only their own departments and offers only the Researcher role.
 */
export async function downloadTemplate(units: Unit[], language: "KA" | "EN", importer: Importer) {
  const [{ default: writeExcelFile }, utility] = await Promise.all([import("write-excel-file/browser"), import("write-excel-file/utility")])
  const visible = importer.canManageRoles ? units : units.filter(unit =>
    unit.kind === "department" ? importer.coordinated.includes(unit.id)
      : units.some(d => d.parent_id === unit.id && importer.coordinated.includes(d.id)))
  const groups = groupByFaculty(visible, language)
  const structure = groups.flatMap(group => group.departments.map(department => [
    group.faculty?.name.en ?? "", department.name.en ?? "", group.faculty?.name.ka ?? "", department.name.ka ?? "",
  ]))
  // The dropdowns offer every name in English and Georgian
  const unique = (names: (string | undefined)[]) => [...new Set(names.filter((name): name is string => Boolean(name)))]
  const facultyNames = unique(groups.flatMap(group => (group.faculty ? [group.faculty.name.en, group.faculty.name.ka] : [])))
  const departmentNames = unique(groups.flatMap(group => group.departments.flatMap(d => [d.name.en, d.name.ka])))
  const listRows = Math.max(structure.length, facultyNames.length, departmentNames.length)
  const structureData = [
    [bold("faculty"), bold("department"), bold("ფაკულტეტი"), bold("დეპარტამენტი"), null, bold("faculty names (for the lists)"), bold("department names (for the lists)")],
    ...Array.from({ length: listRows }, (_, i) => [...(structure[i] ?? ["", "", "", ""]), null, facultyNames[i] ?? "", departmentNames[i] ?? ""]),
  ]

  const roleChoices = importer.canManageRoles ? ROLE_CHOICES_ADMIN : ROLE_CHOICES_COORDINATOR
  const lists: Dropdown[] = [
    ...(facultyNames.length ? [{
      column: "C", choices: `Structure!$F$2:$F$${facultyNames.length + 1}`, title: "Faculty",
      prompt: "Optional. Click the arrow to choose. Needed only when a department name is in several faculties.",
      error: "Choose a faculty from the list (click the arrow).",
    }] : []),
    ...(departmentNames.length ? [{
      column: "D", choices: `Structure!$G$2:$G$${departmentNames.length + 1}`, title: "Department",
      prompt: importer.canManageRoles ? "Click the arrow to choose their department. Leave empty for no department." : "Click the arrow to choose your department.",
      error: "Choose a department from the list (click the arrow).",
    }] : []),
    {
      column: "E", choices: `"${roleChoices.join(",")}"`, title: "Role",
      prompt: importer.canManageRoles
        ? "Click the arrow to choose. A Coordinator coordinates their department. Empty means Researcher."
        : "Coordinators register Researchers only. Empty means Researcher.",
      error: "Choose a role from the list (click the arrow).",
    },
    {
      column: "F", choices: '"X"', title: "Deactivate",
      prompt: "Enter X to deactivate this registered person. Only the email is needed then. Leave empty to register someone.",
      error: "Only X can be entered here. Leave the cell empty to register the person instead.",
    },
  ]

  const help = [
    [bold("How to fill in the People sheet")],
    ["One person per row. Keep the titles in the first row. Click a cell to see what goes in it; columns with a list show an arrow."],
    [""],
    [bold("email"), "Required. Their university Google address, e.g. name.surname@iliauni.edu.ge."],
    [bold("name"), "Optional. Left empty, it's worked out from the email; their official Google name replaces it at first sign-in."],
    [bold("faculty"), "Optional. Choose from the list. Needed only when a department name is in several faculties."],
    [bold("department"), importer.canManageRoles ? "Choose from the list. Leave empty for people without a department." : "Choose your department from the list."],
    [bold("role"), importer.canManageRoles ? "Researcher, Coordinator (coordinates their department) or Admin. Empty means Researcher." : "Researcher. Coordinators register Researchers only."],
    [bold("deactivate"), "X to deactivate someone already registered: only their email is needed. They're signed out at once; their data is kept."],
    [""],
    ["People already registered are reported, not changed. At most 1000 rows per file."],
    ["You can review and correct everything on the site before anything is saved."],
  ]
  await writeExcelFile([
    {
      sheet: "People", stickyRowsCount: 1,
      data: [[bold("email"), bold("name (optional)"), bold("faculty"), bold("department"), bold("role"), bold("deactivate")]],
      columns: [{ width: 36 }, { width: 26 }, { width: 40 }, { width: 36 }, { width: 26 }, { width: 12 }],
    },
    { sheet: "How to fill in", data: help, columns: [{ width: 14 }, { width: 120 }] },
    {
      sheet: "Structure", stickyRowsCount: 1, data: structureData,
      columns: [{ width: 40 }, { width: 36 }, { width: 40 }, { width: 36 }, { width: 4 }, { width: 40 }, { width: 40 }],
    },
  ], { features: [dropdowns(lists, utility)] }).toFile("PEA people template.xlsx")
}
