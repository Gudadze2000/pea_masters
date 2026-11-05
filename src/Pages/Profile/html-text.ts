/** Text length of an HTML string, parsed inertly (no image loads, no scripts). */
export function htmlTextLength(html: string) {
  return (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "").length
}
