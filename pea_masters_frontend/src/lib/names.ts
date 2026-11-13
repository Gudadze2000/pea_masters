/*
 * Name guessed from an ISU email address: "giorgi.kekelidze.3@iliauni.edu.ge" → "Giorgi Kekelidze".
 * Only a starting point while registering someone: their official Google name replaces it at first sign-in.
 * Mirrors name_from_email in pea_masters_backend/app/names.py; keep the two in step.
 */

// Letters (any script), optionally joined by hyphens or apostrophes: "ana-maria", "o'brien"
const namePart = /^\p{L}+(?:['-]\p{L}+)*$/u

const capitalize = (part: string) => part.replace(/\p{L}+/gu, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())

/** Returns null when the address doesn't look like a name, so the person registering types it instead. */
export function nameFromEmail(email: string): string | null {
  const at = email.trim().lastIndexOf("@")
  if (at <= 0) return null
  const parts = email.trim().slice(0, at).split(".").filter(part => part && !/^\d+$/.test(part))
  if (parts.length < 2 || !parts.every(part => namePart.test(part))) return null
  return parts.map(capitalize).join(" ")
}
