import type { Language } from "./language-context"

/** User preferences edited on /settings. Stored in the browser until the back end exists. */
export type NotificationEvent = "deadlines" | "statusChanges" | "adminComments" | "evaluationResults" | "systemUpdates"
export type NotificationChannel = "email" | "inApp"

export type Settings = {
  notifications: Record<NotificationEvent, Record<NotificationChannel, boolean>>
  reminderLeadDays: "1" | "3" | "7" | "14"
  digest: "off" | "daily" | "weekly"
  language: Language
  dateFormat: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD"
  timeZone: string
  reduceMotion: boolean
  profileVisibility: "public" | "university" | "private"
  showEmail: boolean
  showPhoto: boolean
  searchIndexing: boolean
}

export const defaultSettings: Settings = {
  notifications: {
    deadlines: { email: true, inApp: true },
    statusChanges: { email: true, inApp: true },
    adminComments: { email: true, inApp: true },
    evaluationResults: { email: true, inApp: true },
    systemUpdates: { email: false, inApp: true },
  },
  reminderLeadDays: "7",
  digest: "weekly",
  language: "EN",
  dateFormat: "DD/MM/YYYY",
  timeZone: "Asia/Tbilisi",
  reduceMotion: false,
  profileVisibility: "public",
  showEmail: true,
  showPhoto: true,
  searchIndexing: true,
}

const STORAGE_KEY = "pea.settings.v1"

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSettings
    const stored = JSON.parse(raw) as Partial<Settings>
    const notifications = { ...defaultSettings.notifications }
    for (const key of Object.keys(notifications) as NotificationEvent[]) {
      notifications[key] = { ...notifications[key], ...stored.notifications?.[key] }
    }
    return { ...defaultSettings, ...stored, notifications }
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: Settings) {
  // TODO: send to the API once the back end exists
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage can be unavailable (private mode, blocked site data); settings then last for this visit only
  }
}

/** Settings that change how the whole app looks are applied to <html>. */
export function applyDisplaySettings(settings: Pick<Settings, "reduceMotion">) {
  document.documentElement.classList.toggle("reduce-motion", settings.reduceMotion)
}
