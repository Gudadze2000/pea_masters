import { useSyncExternalStore } from "react"
import { getSession, useSession } from "./auth"
import { initialGeneralInformation, type GeneralInformation } from "@/Pages/Profile/profileMock"

/*
 * The signed-in person's saved General information (biography + photo), shared by every page that shows it.
 * Kept in localStorage per account until the back end exists; swap readProfile/saveProfile for API calls later.
 */

const keyPrefix = "pea.profile.v1:"
const listeners = new Set<() => void>()
// Used when localStorage is unavailable (private mode), so saving still works until the tab closes
const memory = new Map<string, string>()
let cache: { key: string; raw: string | null; value: GeneralInformation } | null = null

function storageKey() {
  return keyPrefix + (getSession()?.email ?? "guest")
}

function readRaw(key: string): string | null {
  try {
    const stored = localStorage.getItem(key)
    if (stored !== null) return stored
  } catch { /* fall back to memory */ }
  return memory.get(key) ?? null
}

function parse(raw: string | null): GeneralInformation {
  if (!raw) return initialGeneralInformation
  try {
    const value = JSON.parse(raw) as Partial<GeneralInformation>
    const biography = { ...initialGeneralInformation.biography }
    for (const lang of Object.keys(biography) as (keyof typeof biography)[]) {
      const html = value.biography?.[lang]
      if (typeof html === "string") biography[lang] = html
    }
    const photo = typeof value.photo === "string" && value.photo.startsWith("data:image/") ? value.photo : null
    return { biography, photo }
  } catch {
    return initialGeneralInformation
  }
}

function getSnapshot(): GeneralInformation {
  const key = storageKey()
  const raw = readRaw(key)
  if (!cache || cache.key !== key || cache.raw !== raw) cache = { key, raw, value: parse(raw) }
  return cache.value
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => { if (event.key?.startsWith(keyPrefix)) listener() }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function useProfile(): GeneralInformation {
  useSession() // re-read when a different account signs in
  return useSyncExternalStore(subscribe, getSnapshot, () => initialGeneralInformation)
}

/** Returns false when the browser refused to store it (storage full); the change then lasts only until reload. */
export function saveProfile(info: GeneralInformation): boolean {
  const key = storageKey()
  const raw = JSON.stringify(info)
  let persisted = true
  try {
    localStorage.setItem(key, raw)
    memory.delete(key)
  } catch {
    memory.set(key, raw)
    persisted = false
  }
  listeners.forEach(listener => listener())
  return persisted
}
