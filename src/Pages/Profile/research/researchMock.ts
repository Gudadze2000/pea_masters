/** Front-end sample data for Research overview. Replace with API calls when the back end exists. */

export type Project = {
  id: string
  title: string
  donor: string
  startYear: string
  /** Empty while the project is ongoing */
  endYear: string
  type: "International" | "Local"
  role: string
}

export type Collaboration = { id: string; name: string; institution: string; topic: string }

export type ResearchOverview = {
  interests: string[]
  projects: Project[]
  collaborations: Collaboration[]
  organisations: string[]
}

export const PROJECT_TYPES = ["International", "Local"] as const
export const PROJECT_ROLES = ["PI", "Co-PI", "Coordinator", "Member", "Consultant"] as const

export const initialResearch: ResearchOverview = {
  interests: ["Plant molecular genetics", "Climate adaptation", "Caucasian flora", "Landraces"],
  projects: [
    { id: "p1", title: "GENDROUGHT — Drought-response genes of wheat", donor: "Horizon Europe", startYear: "2022", endYear: "2025", type: "International", role: "PI" },
    { id: "p2", title: "Alpine soil microbiome atlas", donor: "GNSF", startYear: "2021", endYear: "2023", type: "Local", role: "Co-PI" },
    { id: "p3", title: "Seed bank digitisation", donor: "ISU Grant", startYear: "2020", endYear: "2021", type: "Local", role: "Member" },
  ],
  collaborations: [
    { id: "c1", name: "David Mchedlidze", institution: "Ilia State University", topic: "Wheat genomics" },
    { id: "c2", name: "Dr. K. Schulz", institution: "University of Göttingen", topic: "Drought phenotyping" },
  ],
  organisations: ["University of Göttingen", "Max Planck Institute", "Georgian National Science Foundation", "Tbilisi Botanical Garden"],
}
