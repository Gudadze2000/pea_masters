import type { ProfileLinks } from "./cv-model"

/**
 * Research profile links: how each one is entered, checked and turned into a URL.
 * IDs (ORCID, Scopus, ResearcherID) are typed as IDs; the rest are profile URLs.
 */

export type ProfileKey = keyof ProfileLinks

export type ProfileDef = {
  key: ProfileKey
  label: string
  /** Short label on the CV badge */
  badge: string
  placeholder: string
  hint: string
  /** Cleans pasted values, e.g. strips "https://orcid.org/" */
  normalise: (value: string) => string
  /** Error message, or null when valid */
  validate: (value: string) => string | null
  toUrl: (value: string) => string
}

/** ORCID check digit (ISO 7064 MOD 11-2) */
export function orcidChecksumValid(orcid: string) {
  const digits = orcid.replace(/-/g, "")
  if (!/^\d{15}[\dX]$/.test(digits)) return false
  let total = 0
  for (const char of digits.slice(0, 15)) total = (total + Number(char)) * 2
  const result = (12 - (total % 11)) % 11
  return digits[15] === (result === 10 ? "X" : String(result))
}

function isUrlOn(value: string, hosts: string[]) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return (url.protocol === "https:" || url.protocol === "http:") && hosts.some(allowed => host === allowed || host.endsWith(`.${allowed}`))
  } catch {
    return false
  }
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

const urlProfile = (key: ProfileKey, label: string, badge: string, hosts: string[] | null, placeholder: string): ProfileDef => ({
  key, label, badge, placeholder,
  hint: hosts ? `Paste your profile link from ${hosts[0]}.` : "Any web address starting with https://",
  normalise: value => value.trim(),
  validate: value => {
    if (hosts) return isUrlOn(value, hosts) ? null : `Enter a link to your profile on ${hosts[0]}.`
    return isHttpUrl(value) ? null : "Enter a full web address starting with https://"
  },
  toUrl: value => value,
})

export const PROFILE_DEFS: ProfileDef[] = [
  {
    key: "orcid",
    label: "ORCID iD",
    badge: "ORCID",
    placeholder: "0000-0002-1825-0097",
    hint: "16 characters in four groups. You can paste the full orcid.org link.",
    normalise: value => {
      const match = value.trim().toUpperCase().match(/(\d{4})-?(\d{4})-?(\d{4})-?(\d{3}[\dX])/)
      return match ? match.slice(1).join("-") : value.trim()
    },
    validate: value => {
      if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(value)) return "An ORCID iD looks like 0000-0002-1825-0097."
      return orcidChecksumValid(value) ? null : "This ORCID iD has a typo: its last character doesn't match the rest."
    },
    toUrl: value => `https://orcid.org/${value}`,
  },
  {
    key: "scopus",
    label: "Scopus Author ID",
    badge: "Scopus",
    placeholder: "57190000000",
    hint: "The number in your Scopus author profile link (authorId=…).",
    normalise: value => value.trim().match(/authorId=(\d+)/i)?.[1] ?? value.trim(),
    validate: value => /^\d{8,12}$/.test(value) ? null : "A Scopus Author ID is a number of 8–12 digits.",
    toUrl: value => `https://www.scopus.com/authid/detail.uri?authorId=${value}`,
  },
  {
    key: "researcherId",
    label: "Web of Science ResearcherID",
    badge: "Web of Science",
    placeholder: "ABC-1234-2020",
    hint: "Letters, four digits and a year, e.g. ABC-1234-2020.",
    normalise: value => value.trim().toUpperCase(),
    validate: value => /^[A-Z]{1,3}-\d{4}-(19|20)\d{2}$/.test(value) ? null : "A ResearcherID looks like ABC-1234-2020.",
    toUrl: value => `https://www.webofscience.com/wos/author/record/${value}`,
  },
  urlProfile("scholar", "Google Scholar", "Google Scholar", ["scholar.google.com"], "https://scholar.google.com/citations?user=…"),
  urlProfile("researchGate", "ResearchGate", "ResearchGate", ["researchgate.net"], "https://www.researchgate.net/profile/…"),
  urlProfile("semanticScholar", "Semantic Scholar", "Semantic Scholar", ["semanticscholar.org"], "https://www.semanticscholar.org/author/…"),
  urlProfile("website", "Lab or personal website", "Website", null, "https://"),
  urlProfile("github", "GitHub", "GitHub", ["github.com"], "https://github.com/…"),
]

/** Profile links that are filled in and valid, ready to show on the CV */
export function validProfiles(profiles: ProfileLinks) {
  return PROFILE_DEFS
    .filter(def => profiles[def.key] && def.validate(profiles[def.key]) === null)
    .map(def => ({ ...def, value: profiles[def.key], url: def.toUrl(profiles[def.key]) }))
}

/** "https://doi.org/10.1/x", "doi:10.1/x" → "10.1/x" */
export function cleanDoi(value: string) {
  return value.trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, "")
}

export const isDoi = (value: string) => /^10\.\d{4,9}\/\S+$/.test(value)
