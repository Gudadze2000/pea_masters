import { useEffect, useRef } from "react"

const EDGE = 4 // gap above and below the track
const MIN_THUMB = 32
const HIDE_AFTER = 900 // ms after the last scroll

/**
 * Custom scrollbar for the page content (.dashboard-content), drawn over it on the right instead of taking up
 * width. Render it as a child of .dashboard-main, after the content. The browser's own scrollbar is hidden in
 * app-shell.css; wheel, touch and keyboard scrolling are untouched, so this is purely visual (aria-hidden) plus
 * drag and track-click for the mouse. Position updates go straight to the DOM to avoid re-rendering on scroll.
 */
export function ContentScrollbar() {
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const track = trackRef.current
    const thumb = thumbRef.current
    const content = track?.parentElement?.querySelector<HTMLElement>(":scope > .dashboard-content")
    if (!track || !thumb || !content) return

    let frame = 0
    let hideTimer: number | undefined
    let geometry = { trackHeight: 0, thumbHeight: 0, maxScroll: 0 }

    const layout = () => {
      frame = 0
      const { scrollTop, scrollHeight, clientHeight, offsetTop } = content
      const maxScroll = scrollHeight - clientHeight
      const trackHeight = Math.max(0, clientHeight - 2 * EDGE)
      const thumbHeight = Math.min(trackHeight, Math.max(MIN_THUMB, Math.round(trackHeight * clientHeight / Math.max(1, scrollHeight))))
      geometry = { trackHeight, thumbHeight, maxScroll }
      track.style.top = `${offsetTop + EDGE}px`
      track.style.height = `${trackHeight}px`
      track.toggleAttribute("data-overflow", maxScroll > 1)
      thumb.style.height = `${thumbHeight}px`
      thumb.style.transform = `translateY(${maxScroll > 0 ? Math.round((trackHeight - thumbHeight) * scrollTop / maxScroll) : 0}px)`
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(layout) }
    const showForAMoment = () => {
      track.setAttribute("data-scrolling", "")
      window.clearTimeout(hideTimer)
      hideTimer = window.setTimeout(() => track.removeAttribute("data-scrolling"), HIDE_AFTER)
    }
    const onScroll = () => { schedule(); showForAMoment() }

    // The content's height changes as sections open, entries are added or images load
    const resize = new ResizeObserver(schedule)
    const observeChildren = () => {
      resize.disconnect()
      resize.observe(content)
      for (const child of Array.from(content.children)) resize.observe(child)
    }
    const mutations = new MutationObserver(() => { observeChildren(); schedule() })

    // Drag the thumb; a click on the track pages towards the pointer
    let drag: { startY: number; startScroll: number } | null = null
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      if (event.target === thumb) {
        drag = { startY: event.clientY, startScroll: content.scrollTop }
        thumb.setPointerCapture(event.pointerId)
        track.setAttribute("data-dragging", "")
      } else {
        const direction = event.clientY < thumb.getBoundingClientRect().top ? -1 : 1
        content.scrollBy({ top: direction * content.clientHeight * 0.9, behavior: "smooth" })
      }
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!drag) return
      const scrollPerPixel = geometry.maxScroll / Math.max(1, geometry.trackHeight - geometry.thumbHeight)
      content.scrollTop = drag.startScroll + (event.clientY - drag.startY) * scrollPerPixel
    }
    const endDrag = (event: PointerEvent) => {
      if (!drag) return
      drag = null
      if (thumb.hasPointerCapture(event.pointerId)) thumb.releasePointerCapture(event.pointerId)
      track.removeAttribute("data-dragging")
      showForAMoment()
    }

    content.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", schedule)
    track.addEventListener("pointerdown", onPointerDown)
    thumb.addEventListener("pointermove", onPointerMove)
    thumb.addEventListener("pointerup", endDrag)
    thumb.addEventListener("pointercancel", endDrag)
    observeChildren()
    mutations.observe(content, { childList: true })
    layout()

    return () => {
      content.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", schedule)
      track.removeEventListener("pointerdown", onPointerDown)
      thumb.removeEventListener("pointermove", onPointerMove)
      thumb.removeEventListener("pointerup", endDrag)
      thumb.removeEventListener("pointercancel", endDrag)
      resize.disconnect()
      mutations.disconnect()
      cancelAnimationFrame(frame)
      window.clearTimeout(hideTimer)
    }
  }, [])

  return (
    <div ref={trackRef} className="content-scrollbar" aria-hidden="true">
      <div ref={thumbRef} className="content-scrollbar-thumb" />
    </div>
  )
}
