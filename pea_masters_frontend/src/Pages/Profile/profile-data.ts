import { createStore } from "@/lib/store"
import { initialResearch, type ResearchOverview } from "./research/researchMock"
import { initialInterests } from "./teaching/teachingMock"

/*
 * Saved Teaching and Research data, shared by the profile editor and the public profile preview.
 * TODO: load from and save to the API once teaching and research are stored on the server.
 */
export const savedTeachingInterests = createStore<string[]>(initialInterests)
export const savedResearch = createStore<ResearchOverview>(initialResearch)
