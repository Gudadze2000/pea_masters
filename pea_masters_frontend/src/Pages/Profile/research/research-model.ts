/** Research overview: the shapes live with the API client; these are the choices the form offers. */
export type { Collaboration, Project, ResearchOverview } from "@/lib/profile-entries"

export const PROJECT_TYPES = ["International", "Local"] as const
export const PROJECT_ROLES = ["PI", "Co-PI", "Coordinator", "Member", "Consultant"] as const
