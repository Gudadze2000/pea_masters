import { Navigate, Outlet } from "react-router"
import { peopleOrganizations, useSession } from "@/lib/auth"

/**
 * Wraps the Administration pages (People, Evaluation forms): only Admins and Coordinators may open them. Anyone else
 * who types the address is sent to their dashboard. This only keeps the app tidy; the backend refuses the data itself.
 * Goes inside RequireAuth, so the session is known here.
 */
export function RequireStaff() {
  const session = useSession()
  if (!session || peopleOrganizations(session).length === 0) return <Navigate to="/home" replace />
  return <Outlet />
}
