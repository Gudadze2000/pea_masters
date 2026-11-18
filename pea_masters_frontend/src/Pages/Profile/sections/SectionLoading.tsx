import { Button } from "@/components/ui/button"

/** Stands in for a profile section while its saved data loads, or when loading failed */
export function SectionLoading({ id, title, status, onRetry }: { id: string; title: string; status: "idle" | "loading" | "error"; onRetry: () => void }) {
  return (
    <section id={id} className="profile-section" aria-labelledby={`${id}-heading`}>
      <div className="section-heading"><div><h2 id={`${id}-heading`}>{title}</h2></div></div>
      <div className="dashboard-card" role={status === "error" ? "alert" : "status"}>
        {status === "error"
          ? <>Your {title.toLowerCase()} couldn't be loaded. <Button variant="link" onClick={onRetry}>Try again</Button></>
          : `Loading your ${title.toLowerCase()}…`}
      </div>
    </section>
  )
}
