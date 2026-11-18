import { useState } from "react"
import { ExternalLink, Play } from "lucide-react"
import { videoSource } from "@/lib/video"
import "./video-player.css"

/**
 * Plays a video from around the web on the page. Nothing is loaded from the video site until the viewer presses
 * play (no tracking just for opening a profile); links to sites that can't be embedded open in a new tab instead.
 */
export function VideoPlayer({ url, title }: { url: string; title: string }) {
  const source = videoSource(url)
  const [playing, setPlaying] = useState(false)
  if (!source) return null

  if (source.kind === "link") return (
    <a className="video-link" href={source.watchUrl} target="_blank" rel="noopener noreferrer">
      <ExternalLink aria-hidden="true" />Watch on {source.provider}
    </a>
  )

  return (
    <figure className="video-player">
      {playing ? (
        source.kind === "embed" ? (
          <iframe
            src={`${source.embedUrl}${source.embedUrl.includes("?") ? "&" : "?"}autoplay=1`}
            title={`${title} (${source.provider})`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <video src={source.fileUrl} controls autoPlay preload="metadata" aria-label={title} />
        )
      ) : (
        <button type="button" className="video-poster" onClick={() => setPlaying(true)} aria-label={`Play “${title}”`}>
          <span className="video-play" aria-hidden="true"><Play /></span>
          <span className="video-poster-text">Play {source.kind === "embed" ? `· loads from ${source.provider}` : "video"}</span>
        </button>
      )}
      <figcaption>
        <a href={source.watchUrl} target="_blank" rel="noopener noreferrer">Open on {source.provider}<ExternalLink aria-hidden="true" /></a>
      </figcaption>
    </figure>
  )
}
