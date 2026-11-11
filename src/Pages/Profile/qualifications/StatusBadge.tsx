import type { EntryStatus } from "./sections"

const statusLabel: Record<EntryStatus, string> = { draft: "Draft", submitted: "Submitted", approved: "Approved", rejected: "Rejected" }

export function StatusBadge({ status }: { status: EntryStatus }) {
  return <span className={`status-badge status-${status}`}>{statusLabel[status]}</span>
}
