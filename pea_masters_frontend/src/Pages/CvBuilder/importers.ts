import { emptyPublication, type Publication, type PublicationType } from "./cv-model"
import { cleanDoi } from "./identifiers"

/** Publication without an id, as produced by the importers */
export type PublicationDraft = Omit<Publication, "id">

/* ---------- BibTeX ---------- */

const BIBTEX_TYPES: Record<string, PublicationType> = {
  article: "Journal article",
  inproceedings: "Conference paper",
  conference: "Conference paper",
  book: "Book",
  incollection: "Book chapter",
  inbook: "Book chapter",
  phdthesis: "Thesis",
  mastersthesis: "Thesis",
  techreport: "Report",
  unpublished: "Preprint",
  misc: "Preprint",
}

/** Reads `{...}` or `"..."` starting at `start`, allowing nested braces. Returns [value, index after it]. */
function readValue(text: string, start: number): [string, number] {
  const open = text[start]
  if (open === "{") {
    let depth = 0
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++
      else if (text[i] === "}" && --depth === 0) return [text.slice(start + 1, i), i + 1]
    }
    return [text.slice(start + 1), text.length]
  }
  if (open === "\"") {
    const end = text.indexOf("\"", start + 1)
    return [text.slice(start + 1, end < 0 ? undefined : end), end < 0 ? text.length : end + 1]
  }
  const match = /^[^,}\s]+/.exec(text.slice(start))
  return [match?.[0] ?? "", start + (match?.[0].length ?? 0)]
}

/** LaTeX accent command → Unicode combining mark, e.g. {\"u} → ü */
const ACCENTS: Record<string, string> = {
  "`": "̀", "'": "́", "^": "̂", "~": "̃", "=": "̄", "u": "̆",
  ".": "̇", "\"": "̈", "H": "̋", "v": "̌", "c": "̧",
}

/** Removes BibTeX braces and converts the most common LaTeX accents/escapes */
function cleanLatex(value: string) {
  return value
    .replace(/\\([`'^"~=.uvHc])\s*\{?\\?([A-Za-z])\}?/g, (_, accent: string, letter: string) => `${letter}${ACCENTS[accent]}`.normalize("NFC"))
    .replace(/\\&/g, "&")
    .replace(/--/g, "-")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** "Beridze, Nino and Schulz, K." → "Beridze, Nino; Schulz, K." */
function bibtexAuthors(value: string) {
  return value.split(/\s+and\s+/i).map(name => {
    const clean = cleanLatex(name)
    if (clean.includes(",")) return clean
    const words = clean.split(" ")
    return words.length > 1 ? `${words[words.length - 1]}, ${words.slice(0, -1).join(" ")}` : clean
  }).join("; ")
}

/** Parses every @article{...}, @inproceedings{...} etc. Skips @string, @comment and @preamble. */
export function parseBibtex(text: string): PublicationDraft[] {
  const results: PublicationDraft[] = []
  const entryStart = /@(\w+)\s*[{(]/g
  let match: RegExpExecArray | null
  while ((match = entryStart.exec(text))) {
    const kind = match[1].toLowerCase()
    const [body, next] = readValue(text, match.index + match[0].length - 1)
    entryStart.lastIndex = next
    if (kind === "string" || kind === "comment" || kind === "preamble") continue

    const fields: Record<string, string> = {}
    const fieldPattern = /([A-Za-z][\w-]*)\s*=\s*/g
    let field: RegExpExecArray | null
    while ((field = fieldPattern.exec(body))) {
      const [value, end] = readValue(body, field.index + field[0].length)
      fields[field[1].toLowerCase()] = value
      fieldPattern.lastIndex = end
    }
    if (!fields.title) continue

    const type = BIBTEX_TYPES[kind] ?? "Journal article"
    results.push({
      ...emptyPublication(),
      type,
      status: type === "Preprint" ? "Preprint" : "Published",
      authors: bibtexAuthors(fields.author ?? fields.editor ?? ""),
      title: cleanLatex(fields.title),
      venue: cleanLatex(fields.journal ?? fields.booktitle ?? fields.publisher ?? fields.school ?? fields.institution ?? ""),
      year: cleanLatex(fields.year ?? ""),
      volume: cleanLatex(fields.volume ?? ""),
      issue: cleanLatex(fields.number ?? ""),
      pages: cleanLatex(fields.pages ?? ""),
      doi: cleanDoi(cleanLatex(fields.doi ?? "")),
      url: cleanLatex(fields.url ?? ""),
    })
  }
  return results
}
