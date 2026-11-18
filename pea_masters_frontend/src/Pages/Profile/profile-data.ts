import { useEffect } from "react"
import { useSession } from "@/lib/auth"
import { researchApi, teachingApi, type ResearchOverview } from "@/lib/profile-entries"
import { createStore, useStore } from "@/lib/store"

/*
 * Research and Teaching interests as saved on the server, shared by the profile editor, the CV builder and the public
 * profile preview. Loaded once per signed-in person; saving updates the server first, then everyone showing them.
 */

export const EMPTY_RESEARCH: ResearchOverview = { interests: [], projects: [], collaborations: [], organisations: [] }

export const savedResearch = createStore<ResearchOverview>(EMPTY_RESEARCH)
export const savedTeachingInterests = createStore<string[]>([])

type Load = { userId: string | null; status: "idle" | "loading" | "ready" | "error" }
const load = createStore<Load>({ userId: null, status: "idle" })

async function fetchFor(userId: string) {
  load.set({ userId, status: "loading" })
  try {
    const [research, teaching] = await Promise.all([researchApi.get(), teachingApi.get()])
    savedResearch.set(research)
    savedTeachingInterests.set(teaching.interests)
    load.set({ userId, status: "ready" })
  } catch {
    load.set({ userId, status: "error" })
  }
}

/** Loads Research and Teaching for the signed-in person (once); returns how far that got */
export function useProfileData() {
  const session = useSession()
  const state = useStore(load)
  const userId = session?.id ?? null
  useEffect(() => {
    const current = load.get()
    if (userId && (current.userId !== userId || current.status === "idle")) void fetchFor(userId)
    if (!userId && current.userId) {
      savedResearch.set(EMPTY_RESEARCH)
      savedTeachingInterests.set([])
      load.set({ userId: null, status: "idle" })
    }
  }, [userId])
  return state.userId === userId ? state.status : "loading"
}

export const retryProfileData = () => { const { userId } = load.get(); if (userId) void fetchFor(userId) }

export async function saveResearch(research: ResearchOverview) {
  const saved = await researchApi.save(research)
  savedResearch.set(saved)
  return saved
}

export async function saveTeachingInterests(interests: string[]) {
  const saved = await teachingApi.save(interests)
  savedTeachingInterests.set(saved.interests)
  return saved.interests
}
