/**
 * Coordinated programmes and supervised students come from Argus, ISU's study-management system. PEA isn't connected
 * to Argus yet, so these lists are empty and the Teaching section says so.
 * TODO: import them from Argus once ISU's IT department gives access.
 */

export type ProgrammeLevel = "BA" | "MA" | "PhD"
export type StudentStatus = "Active" | "Approved" | "Completed" | "Withdrawn"

export type Programme = { id: string; name: string; level: ProgrammeLevel; year: string; ects: number }
export type Student = { id: string; name: string; level: ProgrammeLevel; thesis: string; status: StudentStatus }

export const ARGUS_CONNECTED = false
export const programmes: Programme[] = []
export const students: Student[] = []
/** Last Argus sync (ISO date), once connected */
export const lastSynced: string | null = null
