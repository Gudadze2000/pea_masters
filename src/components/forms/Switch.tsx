import "./forms.css"

type Props = {
  id?: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** id of the visible label text */
  labelledBy?: string
  /** id of the help text under the label */
  describedBy?: string
  disabled?: boolean
}

/** On/off toggle. Pair it with visible label text and pass that element's id as `labelledBy`. */
export function Switch({ id, checked, onChange, labelledBy, describedBy, disabled }: Props) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      className="switch"
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" aria-hidden="true" />
    </button>
  )
}
