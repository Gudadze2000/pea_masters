import { useNavigate } from "react-router"
import { useQualifications } from "./qualifications-store"
import { sections } from "./sections"

/** Left-hand list of qualification sections with entry counts, shared by the list page and the Languages table. */
export function SectionNav({ currentId }: { currentId: string }) {
  const navigate = useNavigate()
  const { entries } = useQualifications()
  return (
    <nav className="dashboard-card section-nav" aria-label="Qualification sections">
      <ul>
        {sections.map(item => {
          const Icon = item.icon
          const count = entries[item.id]?.length ?? 0
          return (
            <li key={item.id}>
              <button aria-current={item.id === currentId ? "page" : undefined} onClick={() => navigate(`/profile/qualifications/${item.id}`)}>
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
                <span className="count-badge" aria-label={`${count} entries`}>{count}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
