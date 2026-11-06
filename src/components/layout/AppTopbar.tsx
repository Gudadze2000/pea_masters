import type { ReactNode } from "react"
import { useNavigate } from "react-router"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { DashboardIcon as Icon } from "@/components/ui/app-sidebar"
import { useLanguage, type Language } from "@/lib/language-context"
import "./app-shell.css"

const languages: Language[] = ["KA", "EN"]

/** Top bar shared by every workspace page. `children` is the page title or breadcrumb. */
export function AppTopbar({ children, onNavigate }: { children: ReactNode; onNavigate: (name: string) => void }) {
  const { language, setLanguage } = useLanguage()
  const navigate = useNavigate()
  return (
    <header className="dashboard-topbar">
      <div className="topbar-title"><SidebarTrigger />{children}</div>
      <div className="topbar-actions">
        <span className="faculty-pill"><Icon name="imgIconBuilding" />Natural Sciences &amp; Medicine</span>
        <div className="language-switch" aria-label="Language">
          {languages.map(lang => <button key={lang} aria-pressed={language === lang} onClick={() => setLanguage(lang)}>{lang}</button>)}
        </div>
        <button className="notification-button" aria-label="Open notifications" onClick={() => onNavigate("Notifications")}><Icon name="imgNotifications" /></button>
        <button className="dashboard-avatar" aria-label="Open my profile" onClick={() => navigate("/profile/general")}>NB</button>
      </div>
    </header>
  )
}

/** "My profile / General information" style breadcrumb for the top bar. */
export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  const navigate = useNavigate()
  return (
    <nav aria-label="Breadcrumb">
      <ol className="breadcrumb">
        {items.map((item, index) => {
          const last = index === items.length - 1
          return (
            <li key={item.label}>
              {last || !item.to
                ? <span aria-current={last ? "page" : undefined}>{item.label}</span>
                : <button onClick={() => navigate(item.to!)}>{item.label}</button>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
