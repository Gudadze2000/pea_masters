/**
 * Recognises video links from around the web and says how to play them on PEA: an embeddable player (YouTube,
 * Vimeo, Google Drive, Dailymotion, TED), a video file the browser plays itself, or a link that opens elsewhere.
 */

export type VideoSource =
  | { kind: "embed"; provider: string; embedUrl: string; watchUrl: string }
  | { kind: "file"; provider: string; fileUrl: string; watchUrl: string }
  | { kind: "link"; provider: string; watchUrl: string }

const FILE = /\.(mp4|webm|ogv|ogg|m4v)$/i

function parseUrl(raw: string): URL | null {
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`)
    return url.protocol === "https:" || url.protocol === "http:" ? url : null
  } catch {
    return null
  }
}

/** YouTube's "t" parameter: 90, "90s", "1m30s", "1h2m3s" → seconds */
function startSeconds(value: string | null) {
  if (!value) return 0
  if (/^\d+$/.test(value)) return Number(value)
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  return match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0
}

const hostIs = (url: URL, ...hosts: string[]) => {
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "")
  return hosts.some(item => host === item || host.endsWith(`.${item}`))
}

/** Where the video lives and how to play it, or null when it isn't a web address */
export function videoSource(raw: string): VideoSource | null {
  const url = parseUrl(raw)
  if (!url) return null
  const watchUrl = url.toString()
  const segments = url.pathname.split("/").filter(Boolean)

  // YouTube: watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID, /live/ID. The no-cookie domain until the viewer plays.
  if (hostIs(url, "youtube.com", "youtu.be", "youtube-nocookie.com")) {
    const id = hostIs(url, "youtu.be") ? segments[0]
      : url.searchParams.get("v") ?? (["embed", "shorts", "live", "v"].includes(segments[0]) ? segments[1] : undefined)
    if (id && /^[\w-]{11}$/.test(id)) {
      const start = startSeconds(url.searchParams.get("t") ?? url.searchParams.get("start"))
      return { kind: "embed", provider: "YouTube", watchUrl, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0${start ? `&start=${start}` : ""}` }
    }
  }

  // Vimeo: vimeo.com/ID, vimeo.com/ID/HASH (unlisted), player.vimeo.com/video/ID?h=HASH
  if (hostIs(url, "vimeo.com")) {
    const at = segments[0] === "video" ? 1 : segments.findIndex(part => /^\d+$/.test(part))
    const id = segments[at]
    if (id && /^\d+$/.test(id)) {
      const hash = url.searchParams.get("h") ?? (segments[at + 1] && /^[\da-f]+$/i.test(segments[at + 1]) ? segments[at + 1] : null)
      return { kind: "embed", provider: "Vimeo", watchUrl, embedUrl: `https://player.vimeo.com/video/${id}?dnt=1${hash ? `&h=${hash}` : ""}` }
    }
  }

  // Google Drive: /file/d/ID/view → /file/d/ID/preview (the file must be shared with "anyone with the link")
  if (hostIs(url, "drive.google.com") && segments[0] === "file" && segments[1] === "d" && segments[2]) {
    return { kind: "embed", provider: "Google Drive", watchUrl, embedUrl: `https://drive.google.com/file/d/${segments[2]}/preview` }
  }

  // Dailymotion: /video/ID, dai.ly/ID
  if (hostIs(url, "dailymotion.com", "dai.ly")) {
    const id = hostIs(url, "dai.ly") ? segments[0] : segments[0] === "video" ? segments[1] : undefined
    if (id && /^[a-z\d]+$/i.test(id)) {
      return { kind: "embed", provider: "Dailymotion", watchUrl, embedUrl: `https://www.dailymotion.com/embed/video/${id}` }
    }
  }

  // TED: ted.com/talks/SLUG
  if (hostIs(url, "ted.com") && segments[0] === "talks" && segments[1]) {
    return { kind: "embed", provider: "TED", watchUrl, embedUrl: `https://embed.ted.com/talks/${segments[1]}` }
  }

  // A video file the browser can play itself
  if (FILE.test(url.pathname)) return { kind: "file", provider: url.hostname.replace(/^www\./, ""), fileUrl: watchUrl, watchUrl }

  return { kind: "link", provider: url.hostname.replace(/^www\./, ""), watchUrl }
}

/** Sites whose videos play on PEA, for hints */
export const PLAYABLE_SITES = "YouTube, Vimeo, Google Drive, Dailymotion, TED and video files (.mp4, .webm)"
