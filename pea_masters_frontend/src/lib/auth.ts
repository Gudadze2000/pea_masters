import { useSyncExternalStore } from "react"

/*
 * Local, browser-only authentication for the prototype.
 * Accounts and the session live in localStorage until a backend exists, so this is NOT secure:
 * anyone with access to the browser can read or change them. Swap these functions for API calls later;
 * the rest of the app only uses register / signIn / signInAsGuest / signOut / useSession.
 */

export type Session = {
  name: string
  email: string | null
  role: "user" | "guest"
}

type StoredUser = {
  name: string
  email: string
  salt: string
  passwordHash: string
  createdAt: string
}

const usersKey = "pea.auth.users.v1"
const sessionKey = "pea.auth.session.v1"
export const minPasswordLength = 8

const listeners = new Set<() => void>()
let cachedRaw: string | null | undefined
let cachedSession: Session | null = null

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* Storage may be unavailable (private mode); the session then lasts until reload. */ }
}

function parseSession(raw: string | null): Session | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (value && typeof value === "object") {
      const { name, email, role } = value as Record<string, unknown>
      if (typeof name === "string" && (email === null || typeof email === "string") && (role === "user" || role === "guest")) {
        return { name, email, role }
      }
    }
  } catch { /* fall through */ }
  return null
}

let memorySession: string | null = null

function getSnapshot(): Session | null {
  const raw = readStorage(sessionKey) ?? memorySession
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSession = parseSession(raw)
  }
  return cachedSession
}

function setSession(session: Session | null) {
  const raw = session ? JSON.stringify(session) : null
  memorySession = raw
  writeStorage(sessionKey, raw)
  listeners.forEach(listener => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Keep tabs in sync: signing out in one tab signs out the others.
  const onStorage = (event: StorageEvent) => { if (event.key === sessionKey) listener() }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

export function getSession() {
  return getSnapshot()
}

export function useSession() {
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}

function readUsers(): StoredUser[] {
  try {
    const value: unknown = JSON.parse(readStorage(usersKey) ?? "[]")
    return Array.isArray(value) ? value.filter((u): u is StoredUser =>
      u && typeof u.email === "string" && typeof u.name === "string" && typeof u.salt === "string" && typeof u.passwordHash === "string") : []
  } catch { return [] }
}

function toHex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("")
}

async function hashPassword(password: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${password}`)
  return toHex(await crypto.subtle.digest("SHA-256", data))
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class AuthError extends Error {}

export async function register(input: { name: string; email: string; password: string }) {
  const name = input.name.trim()
  const email = normalizeEmail(input.email)
  if (!name) throw new AuthError("Enter your full name.")
  if (!emailPattern.test(email)) throw new AuthError("Enter a valid email address.")
  if (input.password.length < minPasswordLength) throw new AuthError(`Password must be at least ${minPasswordLength} characters.`)

  const users = readUsers()
  if (users.some(user => user.email === email)) throw new AuthError("An account with this email already exists. Sign in instead.")

  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)))
  const user: StoredUser = { name, email, salt, passwordHash: await hashPassword(input.password, salt), createdAt: new Date().toISOString() }
  writeStorage(usersKey, JSON.stringify([...users, user]))
  setSession({ name, email, role: "user" })
}

export async function signIn(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput)
  const user = readUsers().find(candidate => candidate.email === email)
  // Same message for unknown email and wrong password, so the form does not reveal which accounts exist.
  if (!user || (await hashPassword(password, user.salt)) !== user.passwordHash) {
    throw new AuthError("Email or password is incorrect.")
  }
  setSession({ name: user.name, email: user.email, role: "user" })
}

export function signInAsGuest() {
  setSession({ name: "Guest", email: null, role: "guest" })
}

export function signOut() {
  setSession(null)
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?"
}
