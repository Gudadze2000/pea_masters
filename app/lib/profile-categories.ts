// Entry categories for the Professional, Teaching and Research sections.
// Used by the server actions (validation) and the pages (labels). Keep it client-safe.
export const CATEGORIES = {
  professional: [
    { value: "award", label: "Award" },
    { value: "membership", label: "Membership" },
    { value: "employment", label: "Employment" },
    { value: "education", label: "Education" },
    { value: "language", label: "Language" },
    { value: "committee", label: "Committee" },
    { value: "consultancy", label: "Consultancy" },
    { value: "creative", label: "Creative work" },
    { value: "patent", label: "Patent or licensing agreement" },
    { value: "other", label: "Other activity" },
  ],
  teaching: [
    { value: "teaching_interest", label: "Teaching interest" },
    { value: "module", label: "Programme or module coordinated" },
    { value: "student", label: "Student supervised" },
  ],
  research: [
    { value: "project", label: "Research project" },
    { value: "contract_researcher", label: "Contract researcher" },
    { value: "collaborator", label: "Collaborator" },
  ],
} as const;

export type Section = keyof typeof CATEGORIES;
export const SECTION_LABELS: Record<Section, string> = {
  professional: "Professional & qualifications",
  teaching: "Teaching",
  research: "Research overview",
};

const ALL = (Object.keys(CATEGORIES) as Section[]).flatMap((s) => CATEGORIES[s].map((c) => ({ ...c, section: s })));

export const ALL_CATEGORY_VALUES: string[] = ALL.map((c) => c.value);

export function sectionForCategory(value: string): Section | undefined {
  return ALL.find((c) => c.value === value)?.section;
}

export function categoryLabel(value: string): string {
  return ALL.find((c) => c.value === value)?.label ?? value;
}

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ka", label: "Georgian (ქართული)" },
];

// Entries store their period as text: "2019-09-01 – 2022-06-30" (or a single date).
export function joinPeriod(from: string, to: string): string {
  if (from && to) return `${from} – ${to}`;
  return from || to;
}

export function splitPeriod(period: string): { from: string; to: string } {
  const [from = "", to = ""] = period.split(" – ");
  return { from: from.trim(), to: to.trim() };
}

// Only these categories can be shared with other people.
export const SHAREABLE_CATEGORIES = ["patent", "project"];
