import { Navigate, Outlet } from "react-router"
import { useAuth } from "@/lib/auth"

/** Wraps the routes that need a signed-in user; anyone else is sent to the login page. */
export function RequireAuth() {
  const { status } = useAuth()
  if (status === "loading") return null // the session check takes a moment; render nothing rather than flash the login page
  if (status !== "signed-in") return <Navigate to="/login" replace />
  return <Outlet />
}
