import { useSyncExternalStore } from "react"
import { api } from "./api"

/**
 * Notifications under the bell, from the server (app/notifications.py). They're fetched when something first shows
 * them, then every minute and whenever the tab gets focus again; reading them is saved on the server.
 */
export type NotificationKind =
  | "form_sent" | "form_changed" | "entry_rejected" | "form_returned" | "form_approved" | "form_reopened"
  | "deadline_extended" | "deadline_soon" | "form_submitted"
export type NotificationTone = "danger" | "warning" | "success" | "info" | "brand"

export type AppNotification = {
  id: string
  kind: NotificationKind
  title: string
  detail: string
  /** The page it opens */
  link: string | null
  /** An evaluation entry it's about: the page opens that entry */
  entry_ref: { recordId: string; entryId: string } | null
  /** When it arrived, in ms */
  at: number
  read: boolean
}

type ServerNotification = Omit<AppNotification, "at"> & { created_at: string }

export const toneOf: Record<NotificationKind, NotificationTone> = {
  form_sent: "brand", form_changed: "info", entry_rejected: "danger", form_returned: "danger",
  form_approved: "success", form_reopened: "info", deadline_extended: "info", deadline_soon: "warning",
  form_submitted: "info",
}

type State = { items: AppNotification[]; unread: number; loaded: boolean }

const REFRESH_MS = 60_000
let state: State = { items: [], unread: 0, loaded: false }
const listeners = new Set<() => void>()
let timer: number | undefined
let pending: Promise<void> | null = null

function set(next: State) {
  state = next
  listeners.forEach(listener => listener())
}

/** Fetches the newest notifications; failures keep what's shown (the next refresh tries again) */
export function refreshNotifications(): Promise<void> {
  pending ??= api<{ items: ServerNotification[]; unread: number }>("/me/notifications")
    .then(({ items, unread }) => set({
      items: items.map(({ created_at, ...item }) => ({ ...item, at: Date.parse(created_at) })), unread, loaded: true,
    }))
    .catch(() => undefined)
    .finally(() => { pending = null })
  return pending
}

const onFocus = () => { void refreshNotifications() }

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    void refreshNotifications()
    timer = window.setInterval(() => { if (document.visibilityState === "visible") void refreshNotifications() }, REFRESH_MS)
    window.addEventListener("focus", onFocus)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.clearInterval(timer)
      window.removeEventListener("focus", onFocus)
    }
  }
}

/** The notifications, newest first, and how many are unread; re-renders when they change */
export const useNotifications = () => useSyncExternalStore(subscribe, () => state)

export function markRead(id: string) {
  const item = state.items.find(entry => entry.id === id)
  if (!item || item.read) return
  set({ ...state, items: state.items.map(entry => (entry.id === id ? { ...entry, read: true } : entry)), unread: Math.max(0, state.unread - 1) })
  void api<null>(`/me/notifications/${id}/read`, { method: "POST" }).catch(() => refreshNotifications())
}

export function markAllRead() {
  if (state.unread === 0) return
  set({ ...state, items: state.items.map(entry => ({ ...entry, read: true })), unread: 0 })
  void api<null>("/me/notifications/read-all", { method: "POST" }).catch(() => refreshNotifications())
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

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
