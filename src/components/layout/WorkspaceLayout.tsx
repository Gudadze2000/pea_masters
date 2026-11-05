import { useState, type CSSProperties, type ReactNode } from "react"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/ui/app-sidebar"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AppTopbar, Breadcrumb } from "./AppTopbar"

type Crumb = { label: string; to?: string }

/**
 * Sidebar + top bar + page content, with a "coming soon" panel for
 * destinations that don't have a page yet.
 */
export function WorkspaceLayout({ breadcrumb, children }: { breadcrumb: Crumb[]; children: (openPanel: (name: string) => void) => ReactNode }) {
  const [panel, setPanel] = useState<string | null>(null)
  return (
    <SidebarProvider style={{ "--sidebar-width": "264px" } as CSSProperties}>
      <AppSidebar onNavigate={setPanel} />
      <main className="dashboard-main">
        <AppTopbar onNavigate={setPanel}><Breadcrumb items={breadcrumb} /></AppTopbar>
        {children(setPanel)}
      </main>
      <Sheet open={panel !== null} onOpenChange={open => { if (!open) setPanel(null) }}>
        <SheetContent className="dashboard-panel">
          <SheetHeader>
            <SheetTitle>{panel}</SheetTitle>
            <SheetDescription>This feature will be connected when the rest of the application is built.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  )
}
