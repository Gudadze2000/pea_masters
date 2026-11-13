import { useSyncExternalStore } from "react"

/**
 * Notifications shown in the top bar pop-up. Sample data until the back end exists; which ones the user has read
 * is kept in the browser.
 */
export type NotificationTone = "danger" | "warning" | "success" | "info" | "brand"
export type NotificationKind = "rejected" | "deadline" | "approved" | "comment" | "missing-file" | "period" | "profile" | "system"

export type AppNotification = {
  id: string
  kind: NotificationKind
  tone: NotificationTone
  title: string
  detail: string
  /** When it arrived, in ms */
  at: number
  /** Page the notification opens */
  to?: string
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
// Sample times are relative to when the app loaded, so "Today" / "Earlier" always has something in it
const loadedAt = Date.now()

const sample: (Omit<AppNotification, "at"> & { ago: number })[] = [
  { id: "n-rejected-article", ago: 10 * MINUTE, kind: "rejected", tone: "danger", title: "Journal article needs revision", detail: "Article (Scopus) entry #2 was rejected: the DOI does not match the attached PDF. Open the record to see the reviewer's comment.", to: "/evaluation-form" },
  { id: "n-deadline", ago: 1 * HOUR, kind: "deadline", tone: "warning", title: "Submission deadline approaching", detail: "Submit your evaluation form by 30 November 2026.", to: "/evaluation-form" },
  { id: "n-education-approved", ago: 2 * HOUR, kind: "approved", tone: "success", title: "Education entries approved", detail: "3 education entries were approved by your faculty administrator.", to: "/profile#education" },
  { id: "n-admin-comment", ago: 5 * HOUR, kind: "comment", tone: "info", title: "New comment from Giorgi Kapanadze", detail: "\"Please add the ISBN for the 2025 monograph.\"", to: "/evaluation-form" },
  { id: "n-missing-file", ago: 1 * DAY + 3 * HOUR, kind: "missing-file", tone: "warning", title: "Conference presentation is missing a file", detail: "Attach a certificate or programme page (PDF or image).", to: "/evaluation-form" },
  { id: "n-teaching-approved", ago: 2 * DAY, kind: "approved", tone: "success", title: "Teaching portfolio approved", detail: "Your teaching portfolio has been reviewed and approved.", to: "/profile#teaching" },
  { id: "n-period-open", ago: 3 * DAY, kind: "period", tone: "info", title: "Evaluation period is open", detail: "You can now add records for the 2025-2026 annual evaluation.", to: "/evaluation-form" },
  { id: "n-profile", ago: 6 * DAY, kind: "profile", tone: "brand", title: "Complete your profile", detail: "Add a photo and a short biography so reviewers and students can find you.", to: "/profile#general" },
  { id: "n-system", ago: 9 * DAY, kind: "system", tone: "info", title: "CV Builder is available", detail: "Build and download your academic CV from the records you have already entered.", to: "/cv-builder" },
]

export const notifications: AppNotification[] = sample.map(({ ago, ...item }) => ({ ...item, at: loadedAt - ago }))

const READ_KEY = "pea.notifications.read.v1"
// Older items start out read, so the sample opens with a few unread ones like a real inbox would
const defaultRead = ["n-missing-file", "n-teaching-approved", "n-period-open", "n-profile", "n-system"]

function loadRead(): Set<string> {
  try {
    const raw = window.localStorage.getItem(READ_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    // Unreadable storage: fall back to the defaults
  }
  return new Set(defaultRead)
}

let read = loadRead()
const listeners = new Set<() => void>()

function setRead(next: Set<string>) {
  read = next
  try {
    window.localStorage.setItem(READ_KEY, JSON.stringify([...next]))
  } catch {
    // Storage unavailable: read state lasts for this visit only
  }
  listeners.forEach(listener => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The set of read notification ids; re-renders when it changes */
export const useReadNotifications = () => useSyncExternalStore(subscribe, () => read)

export const markRead = (id: string) => { if (!read.has(id)) setRead(new Set(read).add(id)) }
export const markAllRead = () => setRead(new Set(notifications.map(item => item.id)))

/** "10 min ago", "3 hr ago", "2 days ago" */
export function timeAgo(at: number, now = Date.now()) {
  const diff = Math.max(0, now - at)
  if (diff < MINUTE) return "Just now"
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} hr ago`
  const days = Math.floor(diff / DAY)
  return days === 1 ? "Yesterday" : `${days} days ago`
}

export const isToday = (at: number, now = Date.now()) => new Date(at).toDateString() === new Date(now).toDateString()

/** Badge text: grows from one to three digits, then caps */
export const badgeCount = (count: number) => (count > 999 ? "999+" : String(count))

// The pop-up can be opened from elsewhere (the dashboard's "View all" link)
type PopoverRequest = { expanded: boolean; seq: number }
let request: PopoverRequest = { expanded: false, seq: 0 }
const requestListeners = new Set<() => void>()
export function openNotifications(expanded = false) {
  request = { expanded, seq: request.seq + 1 }
  requestListeners.forEach(listener => listener())
}
export const useNotificationsRequest = () => useSyncExternalStore(
  listener => { requestListeners.add(listener); return () => { requestListeners.delete(listener) } },
  () => request,
)
