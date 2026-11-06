import { useState, type CSSProperties, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppTopbar } from "@/components/layout/AppTopbar"
import { AppSidebar, DashboardIcon as Icon } from "@/components/ui/app-sidebar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import "./HomePage.css"

const stats = [
  { label: "Evaluation status", value: "Draft", detail: "Not yet submitted", icon: "imgIconFile1", tone: "neutral" },
  { label: "Form completion", value: "64%", detail: "9 of 14 sections filled", icon: "imgIconChart", tone: "brand" },
  { label: "Provisional score", value: "58 pts", detail: "Counted after admin approval", icon: "imgIconStar", tone: "warning" },
  { label: "Time left", value: "27 days", detail: "Deadline 30 Nov 2026", icon: "imgIconClock", tone: "danger" },
]
const progress = [
  { label: "Professional & qualifications", done: 4, total: 6 },
  { label: "Teaching", done: 2, total: 3 },
  { label: "Research overview", done: 3, total: 5 },
  { label: "Scored evaluation records", done: 5, total: 9 },
]
const notifications = [
  { title: "2 fields rejected", detail: "Review the admin comments", icon: "imgIconAlert2", tone: "danger" },
  { title: "Deadline reminder sent", detail: "27 days left to submit", icon: "imgIconMail", tone: "info" },
  { title: "Education entries approved", detail: "3 entries approved yesterday", icon: "imgIconCheck", tone: "success" },
]
function Card({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`dashboard-card ${className}`}><div className="card-heading"><h2>{title}</h2>{action}</div>{children}</section>
}
function Progress({ value, label, warning = false }: { value: number; label: string; warning?: boolean }) {
  return <div className={`dashboard-progress ${warning ? "warning" : ""}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${value}%` }} /></div>
}
function NotificationList() {
  return <div className="notification-list">{notifications.map(item => <div className="notification-row" key={item.title}><span className={`icon-tile ${item.tone}`}><Icon name={item.icon} /></span><div><p>{item.title}</p><small>{item.detail}</small></div></div>)}</div>
}
export function HomePage() {
  const navigate = useNavigate()
  const [panel, setPanel] = useState<string | null>(null)
  const open = (name: string) => { if (name === "Evaluation form") navigate("/evaluation-form"); else if (name !== "Dashboard") setPanel(name) }
  return (
    <SidebarProvider style={{ "--sidebar-width": "264px" } as CSSProperties}>
      <AppSidebar onNavigate={open} />
      <main className="dashboard-main">
        <AppTopbar onNavigate={open}><span>Dashboard</span></AppTopbar>
        <div className="dashboard-content">
          <div className="page-heading"><div><h1>Good evening, Nino</h1><p>Biology · Associate Professor · Faculty of Natural Sciences and Medicine</p></div><Button variant="outline" className="dashboard-button" onClick={() => open("Download CV")}><Icon name="imgIconDownload" />Download CV</Button></div>
          <section className="evaluation-banner"><Icon name="imgIconAlert" /><div><p>Evaluation 2025–2026 is open — your form is still a draft</p><small>Submit before 30 November 2026. You will get an email reminder as the deadline approaches.</small></div><Button onClick={() => open("Evaluation form")}>Continue</Button></section>
          <div className="dashboard-stats">{stats.map(stat => <section className="stat-card" key={stat.label}><div className="stat-heading"><h2>{stat.label}</h2><span className={`icon-tile ${stat.tone}`}><Icon name={stat.icon} /></span></div><p className="stat-value">{stat.value}</p><small>{stat.detail}</small></section>)}</div>
          <div className="dashboard-columns">
            <div className="dashboard-stack">
              <Card title="Evaluation progress" action={<Button variant="ghost" className="soft-button" onClick={() => open("Evaluation form")}>Open form<Icon name="imgIconChevR" /></Button>}>
                <div className="progress-list">{progress.map(item => <div key={item.label}><div className="progress-label"><span>{item.label}</span><small>{item.done} / {item.total}</small></div><Progress value={item.done / item.total * 100} label={item.label} /></div>)}</div>
              </Card>
              <Card title="Needs your attention">
                <div className="attention-list"><div className="attention-row danger"><Icon name="imgIconAlert1" /><div><p>Article (Scopus) — entry #2 was rejected</p><small>“DOI does not match the attached PDF. Please upload the correct file.” — Giorgi Kapanadze</small></div><Button variant="outline" className="danger-button" onClick={() => open("Fix rejected article")}>Fix</Button></div>
                <div className="attention-row warning"><Icon name="imgIconClock1" /><div><p>Conference presentation — missing attachment</p><small>Attach a certificate or programme page (PDF or image).</small></div><Button variant="outline" onClick={() => open("Add attachment")}>Add file</Button></div></div>
              </Card>
            </div>
            <div className="dashboard-stack">
              <Card title="Evaluation period"><div className="period-content"><div className="period-title"><span className="open-badge"><Icon name="imgDot" />Open</span><span>Annual evaluation 2025–2026</span></div><small>Opened 1 Oct 2026 · Closes 30 Nov 2026</small><Progress warning value={38.4} label="Evaluation period elapsed" /><Button className="dashboard-button w-full" onClick={() => open("Evaluation form")}><Icon name="imgIconFile2" />Continue evaluation</Button></div></Card>
              <Card title="Notifications" action={<button className="text-action" onClick={() => open("Notifications")}>View all</button>}><NotificationList /></Card>
              <Card title="Quick actions" className="quick-actions">{[["Update my profile", "imgIconUser1"], ["Build a CV", "imgIconBook1"], ["Request edit access", "imgIconUnlock"]].map(([label, icon]) => <Button key={label} variant="outline" className="dashboard-button w-full" onClick={() => label === "Update my profile" ? navigate("/profile/general") : open(label)}><Icon name={icon} />{label}</Button>)}</Card>
            </div>
          </div>
        </div>
      </main>
      <Sheet open={panel !== null} onOpenChange={value => { if (!value) setPanel(null) }}><SheetContent className="dashboard-panel"><SheetHeader><SheetTitle>{panel}</SheetTitle><SheetDescription>{panel === "Notifications" ? "Updates about your evaluation." : "This dashboard preview uses sample data. This feature will be connected when the rest of the application is built."}</SheetDescription></SheetHeader>{panel === "Notifications" && <NotificationList />}</SheetContent></Sheet>
    </SidebarProvider>
  )
}
