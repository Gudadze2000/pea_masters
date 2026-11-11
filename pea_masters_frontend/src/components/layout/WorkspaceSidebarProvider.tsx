import { useState, type CSSProperties, type ReactNode } from "react"
import { SidebarProvider } from "@/components/ui/sidebar"

/** The sidebar component saves its open/collapsed state in this cookie whenever it is toggled */
function savedSidebarOpen() {
  const match = document.cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/)
  return match ? match[1] === "true" : true
}

const sizes = {
  "--sidebar-width": "264px",
  // 40px icon buttons + 16px inner padding on each side
  "--sidebar-width-icon": "72px",
} as CSSProperties

/**
 * Sidebar provider for every workspace page. Each page mounts its own provider, so the collapsed
 * state is read back from the cookie here; otherwise it would reset on every navigation.
 */
export function WorkspaceSidebarProvider({ children }: { children: ReactNode }) {
  const [defaultOpen] = useState(savedSidebarOpen)
  return <SidebarProvider defaultOpen={defaultOpen} style={sizes}>{children}</SidebarProvider>
}
