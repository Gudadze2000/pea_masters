import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"

export function DashboardIcon({ name }: { name: string }) {
  return <img className="dashboard-icon" src={`/dashboard/${name}.svg`} alt="" />
}

const navigation = [
  ["Dashboard", "imgIconHome"], ["My profile", "imgIconUser"],
  ["General information", ""], ["Professional & qualifications", ""],
  ["Teaching", ""], ["Research overview", ""],
  ["Evaluation form", "imgIconFile"], ["CV builder", "imgIconBook"],
  ["History", "imgIconHistory"], ["Settings", "imgIconSettings"],
]

export function AppSidebar({ onNavigate }: { onNavigate: (name: string) => void }) {
  const { setOpenMobile, isMobile } = useSidebar()
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
            {navigation.map(([label, icon]) => <SidebarMenuItem key={label}>
              <SidebarMenuButton isActive={label === "Dashboard"} aria-current={label === "Dashboard" ? "page" : undefined} className={icon ? "dashboard-nav-link" : "dashboard-nav-link dashboard-sub-link"} onClick={() => { onNavigate(label); if (isMobile) setOpenMobile(false) }}>
                {icon && <DashboardIcon name={icon} />}<span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>)}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="dashboard-sidebar-footer">
        <div className="user-card"><div className="dashboard-avatar">NB</div><div className="grow"><p>Nino Beridze</p><small>Researcher</small></div><Button variant="ghost" size="icon-sm" aria-label="Sign out" onClick={() => onNavigate("Sign out")}><DashboardIcon name="imgIconLogout" /></Button></div>
      </SidebarFooter>
    </Sidebar>
  )
}
