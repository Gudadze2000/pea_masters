/** Proficiency levels for the Languages table (CEFR scale plus "Native"). `value` is what gets stored. */
export const LEVELS = [
  { value: "Native", label: "Native" },
  { value: "C2", label: "C2 · Proficient" },
  { value: "C1", label: "C1 · Advanced" },
  { value: "B2", label: "B2 · Upper-int." },
  { value: "B1", label: "B1 · Intermediate" },
  { value: "A2", label: "A2 · Elementary" },
  { value: "A1", label: "A1 · Beginner" },
] as const

export const levelLabel = (value: string) => LEVELS.find(level => level.value === value)?.label ?? value

export const LANGUAGES = [
  "Georgian", "English", "Russian", "German", "French",
  "Abkhaz", "Arabic", "Armenian", "Azerbaijani", "Bulgarian", "Chinese", "Czech", "Danish", "Dutch", "Estonian",
  "Finnish", "Greek", "Hebrew", "Hindi", "Hungarian", "Italian", "Japanese", "Kazakh", "Korean", "Latin",
  "Latvian", "Lithuanian", "Megrelian", "Norwegian", "Ossetian", "Persian", "Polish", "Portuguese", "Romanian", "Serbian",
  "Slovak", "Spanish", "Svan", "Swedish", "Turkish", "Ukrainian", "Other",
] as const
