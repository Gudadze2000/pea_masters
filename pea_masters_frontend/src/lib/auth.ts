import { useSyncExternalStore } from "react"

/*
 * Who is signed in, as reported by the backend (GET /api/v1/auth/me).
 * Sign-in itself happens on the server with Google: the browser only holds an httpOnly session cookie,
 * which JavaScript cannot read, so this module asks the API instead of storing anything locally.
 */

export type Role = "admin" | "coordinator" | "member"

export type OrganizationAccess = {
  id: string
  slug: string
  name: Record<string, string> // { ka, en }
  roles: Role[]
}

export type Session = {
  id: string
  name: string
  email: string
  givenName: string | null
  familyName: string | null
  locale: string
  isRoot: boolean
  organizations: OrganizationAccess[]
}

/** "offline": the API couldn't be reached (backend not running?) */
export type AuthState =
  | { status: "loading"; session: null }
  | { status: "signed-in"; session: Session }
  | { status: "signed-out" | "offline"; session: null }

type MeResponse = {
  id: string
  email: string
  display_name: string
  given_name: string | null
  family_name: string | null
  preferred_locale: string
  is_root: boolean
  organizations: OrganizationAccess[]
}

const listeners = new Set<() => void>()
let state: AuthState = { status: "loading", session: null }
let pending: Promise<void> | null = null
// Tells other open tabs to re-check after signing out here
const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("pea.auth")
channel?.addEventListener("message", () => { void refreshSession() })

function setState(next: AuthState) {
  state = next
  listeners.forEach(listener => listener())
}

/** Asks the backend who is signed in. Runs once on load; call again after anything that may change it. */
export function refreshSession(): Promise<void> {
  pending ??= (async () => {
    try {
      const response = await fetch("/api/v1/auth/me", { credentials: "same-origin", headers: { Accept: "application/json" } })
      if (response.ok) {
        const me = (await response.json()) as MeResponse
        setState({
          status: "signed-in",
          session: {
            id: me.id, name: me.display_name, email: me.email, givenName: me.given_name, familyName: me.family_name,
            locale: me.preferred_locale, isRoot: me.is_root, organizations: me.organizations,
          },
        })
      } else {
        // 401 means not signed in; a 5xx or the dev proxy failing to reach the backend means it's down
        setState({ status: response.status === 401 ? "signed-out" : "offline", session: null })
      }
    } catch {
      setState({ status: "offline", session: null })
    } finally {
      pending = null
    }
  })()
  return pending
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const getSnapshot = () => state

void refreshSession()

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useSession(): Session | null {
  return useAuth().session
}

export function getSession(): Session | null {
  return state.session
}

/** Where the browser goes to sign in. A full page navigation, because Google's sign-in page has to open. */
export function googleSignInUrl(email?: string) {
  const query = email?.trim() ? `?${new URLSearchParams({ email: email.trim() })}` : ""
  return `/api/v1/auth/google/login${query}`
}

export async function signOut() {
  const request = fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined)
  setState({ status: "signed-out", session: null })
  await request
  channel?.postMessage("signed-out")
}

const roleLabels: Record<Role, string> = { admin: "Admin", coordinator: "Coordinator", member: "Member" }

/** The person's highest role, for display, e.g. "Admin" */
export function roleLabel(session: Session) {
  if (session.isRoot) return "Root"
  const roles = new Set(session.organizations.flatMap(org => org.roles))
  const top = (["admin", "coordinator", "member"] as const).find(role => roles.has(role))
  return top ? roleLabels[top] : "Member"
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?"
}
