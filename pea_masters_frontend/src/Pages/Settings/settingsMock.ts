/** Front-end sample data for /settings. Replace with API calls when the back end exists. */
export type Session = {
  id: string
  device: string
  location: string
  lastActive: string
  current?: boolean
}

export const initialSessions: Session[] = [
  { id: "s1", device: "Chrome on Windows", location: "Tbilisi, Georgia", lastActive: "Active now", current: true },
  { id: "s2", device: "Safari on iPhone", location: "Tbilisi, Georgia", lastActive: "2 hours ago" },
  { id: "s3", device: "Firefox on macOS", location: "Batumi, Georgia", lastActive: "3 days ago" },
]

/** Last time the password was changed */
export const passwordLastChanged = "2026-08-14"

export const timeZones = [
  "Asia/Tbilisi",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Istanbul",
  "America/New_York",
  "UTC",
]
