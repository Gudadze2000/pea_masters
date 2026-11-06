import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react"
import { Bold, Image as ImageIcon, Italic, List, Paperclip, Underline } from "lucide-react"

type Format = "bold" | "italic" | "underline" | "insertUnorderedList"

const MAX_IMAGE_BYTES = 2 * 1024 * 1024

type Props = {
  /** Used once on mount. Remount the editor (change its `key`) to load other content. */
  initialHtml: string
  onChange: (html: string) => void
  maxLength: number
  label: string
  placeholder?: string
  lang?: string
}

/**
 * Small contentEditable rich-text editor matching the PEA design:
 * bold / italic / underline / bullet list / link / inline image.
 */
export function RichTextEditor({ initialHtml, onChange, maxLength, label, placeholder, lang }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const [active, setActive] = useState<Record<Format, boolean>>({ bold: false, italic: false, underline: false, insertUnorderedList: false })
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const [error, setError] = useState<string | null>(null)

  useLayoutEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialHtml
    // Only on mount: the editor is uncontrolled after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep toolbar buttons in sync with the formatting at the caret
  useEffect(() => {
    const update = () => {
      const selection = document.getSelection()
      if (!selection?.anchorNode || !editorRef.current?.contains(selection.anchorNode)) return
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        insertUnorderedList: document.queryCommandState("insertUnorderedList"),
      })
    }
    document.addEventListener("selectionchange", update)
    return () => document.removeEventListener("selectionchange", update)
  }, [])

  const emit = () => { if (editorRef.current) onChange(editorRef.current.innerHTML) }

  const rememberSelection = () => {
    const selection = document.getSelection()
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) savedRange.current = selection.getRangeAt(0).cloneRange()
  }

  const restoreSelection = () => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const selection = document.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    if (savedRange.current) selection.addRange(savedRange.current)
    else { const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false); selection.addRange(range) }
  }

  const exec = (command: Format) => {
    editorRef.current?.focus()
    document.execCommand(command)
    emit()
  }

  const currentLength = () => editorRef.current?.textContent?.length ?? 0

  const submitLink = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = linkUrl.trim()
    if (!trimmed) return
    const href = /^(https?:|mailto:)/i.test(trimmed) ? trimmed : `https://${trimmed}`
    restoreSelection()
    const selection = document.getSelection()
    if (selection && selection.isCollapsed && selection.rangeCount) {
      // No text selected: insert the URL itself as the link text
      const text = document.createTextNode(trimmed)
      const range = selection.getRangeAt(0)
      range.insertNode(text)
      range.selectNodeContents(text)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    document.execCommand("createLink", false, href)
    selection?.collapseToEnd()
    setLinkOpen(false)
    setLinkUrl("")
    emit()
  }

  const insertImage = (file: File | undefined) => {
    if (!file) return
    if (!["image/png", "image/jpeg"].includes(file.type)) return setError("Images must be JPG or PNG.")
    if (file.size > MAX_IMAGE_BYTES) return setError("Images must be 2 MB or smaller.")
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      restoreSelection()
      document.execCommand("insertImage", false, reader.result as string)
      emit()
    }
    reader.readAsDataURL(file)
  }

  const toolbar: { format: Format; label: string; Icon: typeof Bold }[] = [
    { format: "bold", label: "Bold", Icon: Bold },
    { format: "italic", label: "Italic", Icon: Italic },
    { format: "underline", label: "Underline", Icon: Underline },
  ]

  return (
    <div className="rte">
      <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
        {toolbar.map(({ format, label: name, Icon }) => (
          <button key={format} type="button" aria-label={name} aria-pressed={active[format]} onMouseDown={e => e.preventDefault()} onClick={() => exec(format)}><Icon /></button>
        ))}
        <span className="rte-divider" aria-hidden="true" />
        <button type="button" aria-label="Bulleted list" aria-pressed={active.insertUnorderedList} onMouseDown={e => e.preventDefault()} onClick={() => exec("insertUnorderedList")}><List /></button>
        <button type="button" aria-label="Insert link" aria-expanded={linkOpen} onMouseDown={e => e.preventDefault()} onClick={() => { rememberSelection(); setLinkOpen(open => !open) }}><Paperclip /></button>
        <button type="button" aria-label="Insert image" onMouseDown={e => e.preventDefault()} onClick={() => { rememberSelection(); imageInput.current?.click() }}><ImageIcon /></button>
        <input ref={imageInput} type="file" accept="image/png,image/jpeg" hidden onChange={e => { insertImage(e.target.files?.[0]); e.target.value = "" }} />
      </div>

      {linkOpen && (
        <form className="rte-link" onSubmit={submitLink}>
          <label htmlFor="rte-link-url">Link URL</label>
          <input id="rte-link-url" type="text" inputMode="url" autoFocus placeholder="https://" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} onKeyDown={e => { if (e.key === "Escape") setLinkOpen(false) }} />
          <button type="submit" className="text-action">Insert</button>
          <button type="button" className="rte-link-cancel" onClick={() => setLinkOpen(false)}>Cancel</button>
        </form>
      )}

      <div
        ref={editorRef}
        className="rte-content"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        lang={lang}
        data-placeholder={placeholder}
        onFocus={() => document.execCommand("defaultParagraphSeparator", false, "p")}
        onInput={emit}
        onBlur={rememberSelection}
        onBeforeInput={e => {
          // Block typing past the limit (deletions are always allowed)
          const native = e.nativeEvent as InputEvent
          const selection = document.getSelection()
          if (native.inputType.startsWith("insert") && native.inputType !== "insertParagraph" && selection?.isCollapsed && currentLength() >= maxLength) e.preventDefault()
        }}
        onPaste={e => {
          // Paste as plain text so formatting from Word/web pages doesn't leak in
          e.preventDefault()
          const room = maxLength - currentLength() + (document.getSelection()?.toString().length ?? 0)
          const text = e.clipboardData.getData("text/plain").slice(0, Math.max(0, room))
          document.execCommand("insertText", false, text)
        }}
      />
      {error && <p className="field-error rte-error" role="alert">{error}</p>}
    </div>
  )
}
