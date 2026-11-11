import { useEffect, useRef, useState, type CSSProperties } from "react"
import { useLocation, useNavigate } from "react-router"
import { ChevronDown } from "lucide-react"
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { initials, signOut, useSession } from "@/lib/auth"
import { useProfile } from "@/lib/profile"
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
  /** A group: clicking it shows or hides these items instead of navigating */
  children?: NavItem[]
}

const navigation: NavItem[] = [
  { label: "Dashboard", icon: "imgIconHome", to: "/home" },
  {
    label: "My profile", icon: "imgIconUser", section: "/profile", children: [
      { label: "General information", to: "/profile/general" },
      { label: "Professional & qualifications", to: "/profile/qualifications" },
      { label: "Teaching", to: "/profile/teaching" },
      { label: "Research overview", to: "/profile/research" },
    ],
  },
  { label: "Evaluation form", icon: "imgIconFile", to: "/evaluation-form" },
  { label: "CV builder", icon: "imgIconBook", to: "/cv-builder" },
  { label: "Settings", icon: "imgIconSettings", to: "/settings" },
]

// Every page mounts its own sidebar, so whether "My profile" is open is remembered here between pages
const profileOpenKey = "pea.sidebar.profile-open"

function readProfileOpen(onProfilePage: boolean) {
  if (onProfilePage) return true // show the page you're on
  try { return localStorage.getItem(profileOpenKey) === "true" } catch { return false }
}

/*
 * Every page mounts its own sidebar, so a page change would make it jump straight to its resting state
 * (e.g. a popped-out rail would vanish). Clicking a page records how the sidebar looks; the next page's sidebar
 * starts that way and then moves to its own state, so the usual CSS transitions animate the change.
 * Recorded at click time because the next page renders before the old sidebar unmounts.
 */
let handoff: { popout: boolean; profileOpen: boolean; at: number } | null = null
const takeHandoff = () => (handoff && Date.now() - handoff.at < 1000 ? handoff : null)
/** Called from click handlers just before navigating */
function recordHandoff(popout: boolean, profileOpen: boolean) {
  handoff = { popout, profileOpen, at: Date.now() }
}
function clearHandoff() {
  handoff = null
}

export function AppSidebar({ onNavigate }: { onNavigate: (name: string) => void }) {
  const { setOpenMobile, isMobile } = useSidebar()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const currentPath = pathname === "/" ? "/home" : pathname
  const session = useSession()
  const displayName = session?.name ?? "Nino Beridze"
  const { photo } = useProfile()
  const [profileTarget] = useState(() => readProfileOpen(currentPath.startsWith("/profile")))
  const [profileOpen, setProfileOpen] = useState(() => takeHandoff()?.profileOpen ?? profileTarget)

  // Collapsed rail: pop out only after the mouse rests on it briefly, so passing over it doesn't open it.
  // Done here rather than with a CSS transition-delay, which would also delay clicks inside the open panel.
  const [popout, setPopout] = useState(() => takeHandoff()?.popout ?? false)

  // Coming from another page: after the first paint (in the previous page's look), settle into this page's state
  useEffect(() => {
    clearHandoff()
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => { setPopout(false); setProfileOpen(profileTarget) })
    })
    return () => cancelAnimationFrame(frame)
  }, [profileTarget])
  const rememberLook = () => recordHandoff(popout, profileOpen)
  const popoutTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(popoutTimer.current), [])
  const startPopout = () => {
    window.clearTimeout(popoutTimer.current)
    popoutTimer.current = window.setTimeout(() => setPopout(true), 120)
  }
  const endPopout = () => {
    window.clearTimeout(popoutTimer.current)
    setPopout(false)
  }

  function toggleProfile() {
    const next = !profileOpen
    setProfileOpen(next)
    try { localStorage.setItem(profileOpenKey, String(next)) } catch { /* only remembered until reload */ }
  }

  function link(item: NavItem) {
    const active = item.to !== undefined && (currentPath === item.to || currentPath.startsWith(`${item.to}/`))
    return (
      <SidebarMenuItem key={item.label}>
        <SidebarMenuButton
          isActive={active}
          aria-current={active ? "page" : undefined}
          className={item.icon ? "dashboard-nav-link" : "dashboard-nav-link dashboard-sub-link"}
          onClick={() => {
            if (item.to) { rememberLook(); navigate(item.to) }
            else onNavigate(item.label)
            if (isMobile) setOpenMobile(false)
          }}
        >
          {item.icon && <NavIcon name={item.icon} />}<span>{item.label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  function group(item: NavItem & { children: NavItem[] }) {
    const sectionActive = item.section !== undefined && currentPath.startsWith(item.section)
    return (
      <SidebarMenuItem key={item.label}>
        <SidebarMenuButton
          aria-expanded={profileOpen}
          aria-controls="nav-group-profile"
          className={sectionActive ? "dashboard-nav-link is-section-active" : "dashboard-nav-link"}
          onClick={toggleProfile}
        >
          {item.icon && <NavIcon name={item.icon} />}<span>{item.label}</span>
          {/* Points down while closed, flips up while open (app-shell.css) */}
          <ChevronDown className="nav-chevron" aria-hidden="true" />
        </SidebarMenuButton>
        {/* Always rendered so it can slide open and closed; inert while closed so it can't be tabbed into */}
        <div id="nav-group-profile" className="nav-group-items" data-open={profileOpen || undefined} inert={!profileOpen}>
          <SidebarMenu className="gap-1">{item.children.map(link)}</SidebarMenu>
        </div>
      </SidebarMenuItem>
    )
  }

  function handleSignOut() {
    signOut()
    if (isMobile) setOpenMobile(false)
    navigate("/login", { replace: true })
  }

  return (
    // collapsible="icon": the top-bar toggle (or Ctrl+B) shrinks it to an icon rail; hovering the rail pops it out (app-shell.css)
    <Sidebar className="dashboard-sidebar" collapsible="icon" data-popout={popout || undefined} onMouseEnter={startPopout} onMouseLeave={endPopout}>
      <SidebarHeader className="dashboard-brand">
        <div className="brand-mark">PEA</div>
        <div><p>Personnel Evaluation</p><small>Ilia State University</small></div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="dashboard-nav">
          <p className="workspace-label">RESEARCHER WORKSPACE</p>
          <SidebarMenu className="gap-1" aria-label="Researcher workspace">
            {navigation.map(item => item.children ? group({ ...item, children: item.children }) : link(item))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="dashboard-sidebar-footer">
        <div className="user-card">
          <button
            className="user-card-profile"
            aria-label="Open my profile"
            onClick={() => { rememberLook(); navigate("/profile/general"); if (isMobile) setOpenMobile(false) }}
          >
            <div className="dashboard-avatar">{photo ? <img src={photo} alt="" /> : initials(displayName)}</div><div className="grow"><p>{displayName}</p><small>{session?.role === "guest" ? "Guest" : "Researcher"}</small></div>
          </button>
          <Button variant="ghost" size="icon-sm" aria-label="Sign out" onClick={handleSignOut}><DashboardIcon name="imgIconLogout" /></Button></div>
      </SidebarFooter>
    </Sidebar>
  )
}
