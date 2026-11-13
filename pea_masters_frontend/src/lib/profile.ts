import { useEffect, useSyncExternalStore } from "react"
import { api } from "./api"
import { initials, useSession } from "./auth"
import { useLanguage } from "./language-context"
import { localName } from "./people"

/*
 * The signed-in person's General information (GET /api/v1/me/profile): biography per language, photo, and the
 * institutional details shown with it. Shared by every page that shows the name or photo (sidebar, Profile,
 * Settings, CV), loaded once and refreshed after each save.
 */

type Ref = { id: string; name: Record<string, string> }

export type ProfileAffiliation = { organization: Ref; faculty: Ref | null; department: Ref | null; position: Ref | null }

export type MyProfile = {
  user_id: string
  display_name: string
  given_name: string | null
  family_name: string | null
  email: string
  /** HTML per language: { en, ka } */
  biography: Partial<Record<"en" | "ka", string>>
  photo_url: string | null
  affiliations: ProfileAffiliation[]
  updated_at: string | null
}

export const BIOGRAPHY_MAX_LENGTH = 3000

type State = { status: "idle" | "loading" | "ready" | "error"; profile: MyProfile | null; userId: string | null }

let state: State = { status: "idle", profile: null, userId: null }
const listeners = new Set<() => void>()

function setState(next: State) {
  state = next
  listeners.forEach(listener => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const getSnapshot = () => state

async function load(userId: string) {
  setState({ ...state, status: "loading", userId })
  try {
    setState({ status: "ready", profile: await api<MyProfile>("/me/profile"), userId })
  } catch {
    setState({ status: "error", profile: null, userId })
  }
}

/** The signed-in person's profile; loads it on first use and again when a different person signs in. */
export function useMyProfile() {
  const session = useSession()
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const userId = session?.id ?? null
  useEffect(() => {
    if (userId && (state.userId !== userId || state.status === "idle")) void load(userId)
    if (!userId && state.userId) setState({ status: "idle", profile: null, userId: null })
  }, [userId])
  return current.userId === userId ? current : { status: "loading" as const, profile: null, userId }
}

/** Photo URL for the sidebar and avatars (null: show initials) */
export function useProfile() {
  return { photo: useMyProfile().profile?.photo_url ?? null }
}

/** Name, email and institutional details, in the interface language, for headers and the CV */
export function useIdentity() {
  const session = useSession()
  const { profile } = useMyProfile()
  const { language } = useLanguage()
  const place = profile?.affiliations[0]
  const name = (ref: Ref | null | undefined) => (ref ? localName(ref.name, language) : "")
  const fullName = profile?.display_name ?? session?.name ?? ""
  return {
    fullName,
    familyName: profile?.family_name ?? fullName.split(/\s+/).pop() ?? "",
    initials: initials(fullName),
    email: profile?.email ?? session?.email ?? "",
    organization: name(place?.organization),
    faculty: name(place?.faculty),
    department: name(place?.department),
    position: name(place?.position),
  }
}

function saved(profile: MyProfile) {
  setState({ status: "ready", profile, userId: state.userId })
  return profile
}

export async function saveBiography(biography: Partial<Record<"en" | "ka", string>>) {
  return saved(await api<MyProfile>("/me/profile", { method: "PUT", body: { biography } }))
}

export async function uploadPhoto(photo: Blob) {
  const form = new FormData()
  form.append("photo", photo, "photo.jpg")
  return saved(await api<MyProfile>("/me/profile/photo", { method: "PUT", body: form }))
}

export async function removePhoto() {
  return saved(await api<MyProfile>("/me/profile/photo", { method: "DELETE" }))
}
