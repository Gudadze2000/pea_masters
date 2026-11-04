// Turns technical action errors into messages a non-developer can act on.
const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  year: "Year",
  type: "Type",
  journal: "Journal or venue",
  doi: "DOI",
  authors: "Authors",
  firstName: "First name",
  lastName: "Last name",
  birthDate: "Date of birth",
  university: "University",
  position: "Position",
  department: "Department",
  bio: "Biography",
  category: "Category",
  organisation: "Organisation",
  role: "Role",
  period: "Period",
  description: "Description",
  structuralUnit: "Structural unit",
  subUnit: "Sub-unit",
  scopusId: "Scopus ID",
  wosId: "Web of Science ID",
  orcidId: "ORCID iD",
  keywords: "Keywords",
  authorAliases: "Author names",
};

export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw) return fallback;

  // Validation errors: "Invalid action parameters — title: Too big: ... Received: {...}"
  const validation = raw.match(/Invalid action parameters\s*[—-]\s*([A-Za-z]+)(?:,[^:]*)?:\s*([^.]*)/);
  if (validation) {
    const field = validation[1] ?? "";
    const label = FIELD_LABELS[field] ?? "This field";
    const detail = validation[2] ?? "";
    const max = detail.match(/<=\s*(\d+)/);
    if (/Too big/i.test(detail) && max) return `${label} is too long. Please use ${max[1]} characters or fewer.`;
    if (/Too small/i.test(detail)) return `${label} is required.`;
    if (/Choose a category/i.test(detail)) return "Please choose a category from the list.";
    if (/YYYY-MM-DD/i.test(detail)) return `${label} must be a valid date.`;
    if (/Too big/i.test(detail) || /Too small/i.test(detail)) return `${label} has an invalid value.`;
    return `${label}: please check this field.`;
  }

  // Server messages already written for people, e.g. "This publication is already on your profile."
  const cleaned = (raw.replace(/^Action "[^"]+" failed:\s*/, "").split(" Received:")[0] ?? "").trim();
  if (/unauthenticated|not authenticated/i.test(cleaned)) return "Your session has ended. Please sign in again.";
  if (/^[A-Z].*[.!?]$/.test(cleaned) && cleaned.length < 200) return cleaned;
  return fallback;
}
