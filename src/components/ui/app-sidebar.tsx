import type { CSSProperties } from "react"
import { useLocation, useNavigate } from "react-router"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import "@/components/layout/app-shell.css"

export function DashboardIcon({ name }: { name: string }) {
  return <img className="dashboard-icon" src={`/dashboard/${name}.svg`} alt="" />
}

/** Same Figma SVGs as DashboardIcon, rendered as a mask so the colour follows the active state. */
function NavIcon({ name }: { name: string }) {
  return <span className="nav-icon" aria-hidden="true" style={{ "--icon": `url(/dashboard/${name}.svg)` } as CSSProperties} />
}

type NavItem = {
  label: string
  icon?: string
  /** Route this item opens. Items without one open a placeholder panel via onNavigate. */
  to?: string
  /** Section items are highlighted (brand text, no background) while any route under this prefix is open. */
  section?: string
}

const navigation: NavItem[] = [
  { label: "Dashboard", icon: "imgIconHome", to: "/home" },
  { label: "My profile", icon: "imgIconUser", to: "/profile/general", section: "/profile" },
  { label: "General information", to: "/profile/general" },
  { label: "Professional & qualifications", to: "/profile/qualifications" },
  { label: "Teaching", to: "/profile/teaching" },
  { label: "Research overview", to: "/profile/research" },
  { label: "Evaluation form", icon: "imgIconFile" },
  { label: "CV builder", icon: "imgIconBook", to: "/cv-builder" },
  { label: "Settings", icon: "imgIconSettings", to: "/settings" },
]

export function AppSidebar({ onNavigate }: { onNavigate: (name: string) => void }) {
  const { setOpenMobile, isMobile } = useSidebar()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const currentPath = pathname === "/" ? "/home" : pathname

  return (
    <Sidebar className="dashboard-sidebar">
      <SidebarHeader className="dashboard-brand">
        <div className="brand-mark">PEA</div>
        <div><p>Personnel Evaluation</p><small>Ilia State University</small></div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="dashboard-nav">
          <p className="workspace-label">RESEARCHER WORKSPACE</p>
          <SidebarMenu className="gap-1" aria-label="Researcher workspace">
            {navigation.map(item => {
              const active = !item.section && item.to !== undefined && (currentPath === item.to || currentPath.startsWith(`${item.to}/`))
              const sectionActive = item.section !== undefined && currentPath.startsWith(item.section)
              const classes = ["dashboard-nav-link", !item.icon && "dashboard-sub-link", sectionActive && "is-section-active"].filter(Boolean).join(" ")
              return (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    isActive={active}
                    aria-current={active ? "page" : undefined}
                    className={classes}
                    onClick={() => {
                      if (item.to) navigate(item.to)
                      else onNavigate(item.label)
                      if (isMobile) setOpenMobile(false)
                    }}
                  >
                    {item.icon && <NavIcon name={item.icon} />}<span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="dashboard-sidebar-footer">
        <div className="user-card">
          <button
            className="user-card-profile"
            aria-label="Open my profile"
            onClick={() => { navigate("/profile/general"); if (isMobile) setOpenMobile(false) }}
          >
            <div className="dashboard-avatar">NB</div><div className="grow"><p>Nino Beridze</p><small>Researcher</small></div>
          </button>
          <Button variant="ghost" size="icon-sm" aria-label="Sign out" onClick={() => onNavigate("Sign out")}><DashboardIcon name="imgIconLogout" /></Button></div>
      </SidebarFooter>
    </Sidebar>
  )
}
