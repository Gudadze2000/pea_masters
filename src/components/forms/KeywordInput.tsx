import { useState, type KeyboardEvent } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import "./forms.css"

type Props = {
  keywords: string[]
  onChange: (keywords: string[]) => void
  /** Accessible name of the chip list, e.g. "Teaching interests" */
  label: string
  /** Accessible name of the text box */
  inputLabel?: string
  placeholder?: string
  emptyText?: string
  /** Show an "Add" button next to the text box (Enter always works) */
  showAddButton?: boolean
  maxItems?: number
  maxLength?: number
  /** Used for the error message id, so two inputs on one page don't clash */
  id: string
}

/** Free-text chips: type and press Enter (or comma) to add, × to remove. */
export function KeywordInput({
  keywords, onChange, label, id,
  inputLabel = "New keyword",
  placeholder = "Add a keyword and press Enter",
  emptyText = "Nothing added yet.",
  showAddButton = true,
  maxItems = 20,
  maxLength = 60,
}: Props) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)

  const add = () => {
    const keyword = draft.trim().replace(/\s+/g, " ")
    if (!keyword) return
    if (keywords.some(existing => existing.toLowerCase() === keyword.toLowerCase())) return setError(`“${keyword}” is already in your list.`)
    if (keywords.length >= maxItems) return setError(`You can add up to ${maxItems} items.`)
    onChange([...keywords, keyword])
    setDraft("")
    setError(null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault()
      add()
    } else if (event.key === "Backspace" && !draft && keywords.length) {
      onChange(keywords.slice(0, -1))
    }
  }

  return (
    <div className="keyword-input">
      {keywords.length > 0 ? (
        <ul className="keyword-chips" aria-label={label}>
          {keywords.map(keyword => (
            <li key={keyword} className="keyword-chip">
              {keyword}
              <button type="button" aria-label={`Remove ${keyword}`} onClick={() => onChange(keywords.filter(item => item !== keyword))}><X /></button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">{emptyText}</p>
      )}
      <div className="keyword-add">
        <input
          className="form-control"
          aria-label={inputLabel}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={error ? true : undefined}
          placeholder={placeholder}
          maxLength={maxLength}
          value={draft}
          onChange={e => { setDraft(e.target.value); setError(null) }}
          onKeyDown={onKeyDown}
        />
        {showAddButton && <Button type="button" variant="outline" className="dashboard-button" disabled={!draft.trim()} onClick={add}>Add</Button>}
      </div>
      {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
    </div>
  )
}
