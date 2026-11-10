import type { CitationStyle, Publication } from "./cv-model"

/**
 * Formats publications in APA, IEEE or Harvard style.
 * Returns plain text pieces so the preview can bold the researcher's own name
 * and italicise the venue without building HTML strings.
 */

export type CitationPart = { text: string; italic?: boolean; self?: boolean; link?: string }

type Author = { family: string; initials: string }

/** "Beridze N; Schulz KM" → [{ family: "Beridze", initials: "N." }, { family: "Schulz", initials: "K. M." }] */
export function parseAuthors(authors: string): Author[] {
  return authors.split(";").map(part => part.trim()).filter(Boolean).map(name => {
    const comma = name.indexOf(",")
    const [family, given] = comma >= 0
      ? [name.slice(0, comma).trim(), name.slice(comma + 1).trim()]
      : (() => { const words = name.split(/\s+/); return words.length > 1 ? [words.slice(0, -1).join(" "), words[words.length - 1]] : [name, ""] })()
    const initials = given
      .replace(/\./g, " ")
      .split(/[\s-]+/)
      .filter(Boolean)
      .flatMap(word => /^[A-ZႠ-ჿ]{1,3}$/u.test(word) ? [...word] : [word[0]])
      .map(letter => `${letter.toUpperCase()}.`)
      .join(" ")
    return { family, initials }
  })
}

// Page ranges are shown with a plain hyphen; - (en dash) is still accepted when pasted in
const lastPage = /[-\u2013]/
const pages = (value: string) => value.replace(/\s*[-\u2013]+\s*/g, "-")

/** Puts ", " between names and `lastJoiner` before the last one */
function joinAuthors(names: CitationPart[], lastJoiner: string) {
  const parts: CitationPart[] = []
  names.forEach((name, index) => {
    if (index > 0) parts.push({ text: index === names.length - 1 ? lastJoiner : ", " })
    parts.push(name)
  })
  return parts
}

export function formatCitation(pub: Publication, style: CitationStyle, ownFamilyName: string): CitationPart[] {
  const own = ownFamilyName.toLowerCase()
  const authors = parseAuthors(pub.authors)
  const isSelf = (author: Author) => author.family.toLowerCase() === own
  const doiLink = pub.doi ? `https://doi.org/${pub.doi}` : pub.url
  const year = pub.year || "n.d."
  const status = pub.status === "Published" ? "" : pub.status.toLowerCase()
  const parts: CitationPart[] = []
  const add = (text: string, extra: Omit<CitationPart, "text"> = {}) => { if (text) parts.push({ text, ...extra }) }

  if (style === "IEEE") {
    const names = authors.map(a => ({ text: [a.initials, a.family].filter(Boolean).join(" "), self: isSelf(a) }))
    parts.push(...joinAuthors(names, names.length > 2 ? ", and " : " and "))
    add(`${names.length ? ", " : ""}“${pub.title},” `)
    add(pub.type === "Conference paper" && pub.venue ? "in " : "")
    add(pub.venue, { italic: true })
    const details = [
      pub.volume && `vol. ${pub.volume}`,
      pub.issue && `no. ${pub.issue}`,
      pub.pages && (lastPage.test(pub.pages) ? `pp. ${pages(pub.pages)}` : `p. ${pub.pages}`),
      status || year,
    ].filter(Boolean)
    add(`${pub.venue ? ", " : ""}${details.join(", ")}`)
    if (pub.doi) {
      add(", doi: ")
      add(pub.doi, { link: doiLink })
    }
    add(".")
    return parts
  }

  // APA and Harvard share "Family, I." author names and differ in punctuation
  const names = authors.map(a => ({ text: [a.family, a.initials].filter(Boolean).join(", "), self: isSelf(a) }))
  // APA names already contain commas, so the last one is always ", & "
  parts.push(...joinAuthors(names, style === "APA" ? ", & " : " and "))
  const dated = status ? `${status}` : year
  if (style === "APA") {
    add(` (${dated}). `)
    add(`${pub.title}. `)
  } else {
    add(` (${dated}) `)
    add(`‘${pub.title}’, `)
  }
  if (pub.type === "Book chapter" && pub.venue) add(style === "APA" ? "In " : "in ")
  add(pub.venue, { italic: true })
  const volume = pub.volume ? `${pub.volume}${pub.issue ? `(${pub.issue})` : ""}` : ""
  const pageText = pub.pages ? (style === "Harvard" ? `pp. ${pages(pub.pages)}` : pages(pub.pages)) : ""
  const rest = [volume, pageText].filter(Boolean).join(", ")
  add(rest ? `, ${rest}.` : pub.venue ? "." : "")
  if (doiLink) {
    add(style === "APA" ? " " : pub.doi ? " doi: " : " Available at: ")
    add(style === "Harvard" && pub.doi ? pub.doi : doiLink, { link: doiLink })
    if (style === "Harvard") add(".")
  }
  return parts
}
