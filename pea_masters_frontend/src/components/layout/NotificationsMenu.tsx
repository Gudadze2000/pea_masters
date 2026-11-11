import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react"
import { useNavigate } from "react-router"
import { AlertTriangle, Bell, CalendarClock, CalendarDays, Check, ChevronRight, MessageSquare, Minimize2, Paperclip, Sparkles, UserRound, X } from "lucide-react"
import {
  badgeCount, isToday, markAllRead, markRead, notifications, timeAgo, useNotificationsRequest, useReadNotifications,
  type AppNotification, type NotificationKind,
} from "@/lib/notifications"
import { findEntryNeedingAttention, readDraft, type EvaluationLinkState } from "@/Pages/EvaluationForm/evaluation-model"
import "./notifications.css"

const kindIcons: Record<NotificationKind, ComponentType<{ "aria-hidden"?: boolean }>> = {
  rejected: AlertTriangle, deadline: CalendarClock, approved: Check, comment: MessageSquare,
  "missing-file": Paperclip, period: CalendarDays, profile: UserRound, system: Sparkles,
}

/** How many of the newest notifications the small pop-up lists; "View all" shows the rest */
const PREVIEW_COUNT = 4
/** Tallest the small pop-up gets before its list scrolls */
const MAX_POPUP_HEIGHT = 640

type Tab = "all" | "unread"

/** Bell button in the top bar and the notifications pop-up that opens below it (and grows to fill the page). */
export function NotificationsMenu() {
  const navigate = useNavigate()
  const read = useReadNotifications()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<Tab>("all")
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const listInnerRef = useRef<HTMLDivElement>(null)

  // Opened from elsewhere (the dashboard's "View all")
  const request = useNotificationsRequest()
  const [handledRequest, setHandledRequest] = useState(request.seq)
  if (request.seq !== handledRequest) {
    setHandledRequest(request.seq)
    setOpen(true)
    setExpanded(request.expanded)
  }

  const unread = notifications.filter(item => !read.has(item.id))
  const filtered = tab === "unread" ? unread : notifications
  const shown = expanded ? filtered : filtered.slice(0, PREVIEW_COUNT)
  const today = shown.filter(item => isToday(item.at))
  const earlier = shown.filter(item => !isToday(item.at))

  const close = () => { setOpen(false); setExpanded(false) }

  // The small pop-up's height is set in px so it can animate to and from the full page size
  useLayoutEffect(() => {
    const panel = panelRef.current
    const inner = listInnerRef.current
    if (!panel || !inner || expanded) return
    const list = inner.parentElement!
    const chrome = panel.offsetHeight - list.clientHeight
    const height = Math.min(chrome + inner.offsetHeight, MAX_POPUP_HEIGHT, window.innerHeight - 96)
    panel.style.setProperty("--popup-height", `${Math.round(height)}px`)
  })

  // Click outside or Escape closes it
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
      setExpanded(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpen(false)
      setExpanded(false)
      buttonRef.current?.focus()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const openItem = (item: AppNotification) => {
    markRead(item.id)
    close()
    if (item.kind === "rejected" || item.kind === "missing-file") {
      const draft = readDraft()
      const target = item.kind === "rejected"
        ? findEntryNeedingAttention(draft, "rejected", "article")
        : findEntryNeedingAttention(draft, "missing-file", "conference")
      const state: EvaluationLinkState | undefined = target ? { edit: target } : undefined
      navigate("/evaluation-form", { state })
    } else if (item.to) navigate(item.to)
  }

  const group = (label: string, items: AppNotification[]) => items.length > 0 && (
    <section className="notif-group" aria-label={label}>
      <h3>{label}</h3>
      <ul>{items.map(item => <NotificationRow key={item.id} item={item} unread={!read.has(item.id)} onOpen={() => openItem(item)} />)}</ul>
    </section>
  )

  return (
    <>
      <button
        ref={buttonRef}
        className="notification-button"
        aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls="notifications-panel"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Bell aria-hidden />
        {unread.length > 0 && <span className="notif-bell-badge" aria-hidden="true">{badgeCount(unread.length)}</span>}
      </button>

      <div
        ref={panelRef}
        id="notifications-panel"
        className="notif-panel"
        role="dialog"
        aria-label="Notifications"
        data-open={open || undefined}
        data-expanded={expanded || undefined}
        inert={!open}
      >
        <div className="notif-frame">
          <header className="notif-head">
            <div className="notif-title">
              <h2>Notifications</h2>
              {unread.length > 0 && <span className="notif-count" aria-label={`${unread.length} unread`}>{badgeCount(unread.length)}</span>}
            </div>
            <div className="notif-head-actions">
              <button className="notif-mark-all" onClick={markAllRead} disabled={unread.length === 0}>
                <Check aria-hidden />{unread.length ? "Mark all read" : "All read"}
              </button>
              {expanded && <button className="notif-icon-button" aria-label="Show fewer notifications" onClick={() => setExpanded(false)}><Minimize2 aria-hidden /></button>}
              {expanded && <button className="notif-icon-button" aria-label="Close notifications" onClick={close}><X aria-hidden /></button>}
            </div>
          </header>

          <div className="notif-tabs" role="tablist" aria-label="Filter notifications">
            {(["all", "unread"] as const).map(id => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {id === "all" ? `All (${notifications.length})` : `Unread (${unread.length})`}
              </button>
            ))}
          </div>
        </div>

        <div className="notif-list">
          <div ref={listInnerRef} className="notif-frame">
            {shown.length === 0
              ? (
                <div className="notif-empty">
                  <span><Bell aria-hidden /></span>
                  <p>You're all caught up</p>
                  <small>No unread notifications. New review updates and reminders will appear here.</small>
                </div>
              )
              : <>{group("Today", today)}{group("Earlier", earlier)}</>}
          </div>
        </div>

        <footer className="notif-foot">
          <div className="notif-frame">
            {expanded
              ? <button onClick={() => setExpanded(false)}>Show fewer<Minimize2 aria-hidden /></button>
              : <button onClick={() => setExpanded(true)}>View all notifications<ChevronRight aria-hidden /></button>}
          </div>
        </footer>
      </div>
    </>
  )
}

function NotificationRow({ item, unread, onOpen }: { item: AppNotification; unread: boolean; onOpen: () => void }) {
  const KindIcon = kindIcons[item.kind]
  return (
    <li>
      <button className="notif-row" data-unread={unread || undefined} onClick={onOpen}>
        <span className={`notif-icon tone-${item.tone}`}><KindIcon aria-hidden /></span>
        <span className="notif-text">
          <span className="notif-row-title">{item.title}</span>
          <span className="notif-row-detail">{item.detail}</span>
          <time dateTime={new Date(item.at).toISOString()}>{timeAgo(item.at)}</time>
        </span>
        {unread && <span className="notif-dot" aria-label="Unread" />}
      </button>
    </li>
  )
}
