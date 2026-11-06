/**
 * Front-end sample data for the Teaching page.
 * Programmes and students are read-only here: in production they come from Argus.
 */

export type ProgrammeLevel = "BA" | "MA" | "PhD"
export type StudentStatus = "Active" | "Approved" | "Completed" | "Withdrawn"

export const initialInterests = ["Molecular biology", "Bioinformatics", "Genetics", "Research methods"]

export const programmes: { id: string; name: string; level: ProgrammeLevel; year: string; ects: number }[] = [
  { id: "p1", name: "Molecular Biology II", level: "BA", year: "2025–26", ects: 6 },
  { id: "p2", name: "Bioinformatics Methods", level: "MA", year: "2025–26", ects: 6 },
  { id: "p3", name: "Plant Genetics (PhD seminar)", level: "PhD", year: "2024–25", ects: 10 },
]

export const students: { id: string; name: string; level: ProgrammeLevel; thesis: string; status: StudentStatus }[] = [
  { id: "s1", name: "Ana Gelashvili", level: "PhD", thesis: "Drought genes in wheat landraces", status: "Active" },
  { id: "s2", name: "Irakli Tabatadze", level: "MA", thesis: "CRISPR screening in Arabidopsis", status: "Approved" },
  { id: "s3", name: "Mariam Kobakhidze", level: "BA", thesis: "Microbiome of alpine soils", status: "Approved" },
]

/** Last Argus sync (ISO date) */
export const lastSynced = "2026-11-02"
