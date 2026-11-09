import { useRef, useState } from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"

const MIN_SIZE = 400
const MAX_BYTES = 5 * 1024 * 1024

function readImage(file: File) {
  return new Promise<{ dataUrl: string; width: number; height: number }>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("read"))
    reader.onload = () => {
      const dataUrl = reader.result as string
      const image = new Image()
      image.onload = () => resolve({ dataUrl, width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new Error("decode"))
      image.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}

const AVATAR_SIZE = 512

/**
 * Centre-crops the photo to a square and scales it to 512×512 JPEG (~50–100 KB), so it fits in browser storage
 * (a 5 MB upload would not) and stays small enough to send to the server later.
 */
function toAvatar(dataUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight)
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = AVATAR_SIZE
      const context = canvas.getContext("2d")
      if (!context) return reject(new Error("canvas"))
      context.fillStyle = "#ffffff" // transparent PNG areas would otherwise turn black in JPEG
      context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
      context.imageSmoothingQuality = "high"
      context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
      resolve(canvas.toDataURL("image/jpeg", 0.88))
    }
    image.onerror = () => reject(new Error("decode"))
    image.src = dataUrl
  })
}

export function PhotoUpload({ photo, initials, onChange }: { photo: string | null; initials: string; onChange: (photo: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    if (!["image/jpeg", "image/png"].includes(file.type)) return setError("Choose a JPG or PNG file.")
    if (file.size > MAX_BYTES) return setError("The photo must be 5 MB or smaller.")
    try {
      const { dataUrl, width, height } = await readImage(file)
      if (width < MIN_SIZE || height < MIN_SIZE) return setError(`The photo is ${width}×${height} px. Use one at least ${MIN_SIZE}×${MIN_SIZE} px.`)
      setError(null)
      onChange(await toAvatar(dataUrl))
    } catch {
      setError("This file could not be read as an image.")
    }
  }

  return (
    <div className="photo-row">
      <div className="photo-avatar">
        {photo ? <img src={photo} alt="Your profile photo" /> : <span aria-label="No photo, showing initials">{initials}</span>}
      </div>
      <div className="photo-controls">
        <div className="photo-actions">
          <Button variant="outline" className="dashboard-button" onClick={() => input.current?.click()}><Upload />Upload photo</Button>
          {photo && <button type="button" className="text-action photo-remove" onClick={() => { setError(null); onChange(null) }}>Remove</button>}
          <input ref={input} type="file" accept="image/jpeg,image/png" hidden onChange={e => { handleFile(e.target.files?.[0]); e.target.value = "" }} />
        </div>
        <p className="field-hint">JPG or PNG, square, at least 400×400 px. Shown on your public profile and CV.</p>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    </div>
  )
}
