// Profile photo helpers: validation and storage limits.
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/;

export function parsePhotoDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = DATA_URL.exec(dataUrl);
  if (!match) throw new Error("Photo must be a JPEG, PNG or WebP image.");
  const mimeType = match[1] ?? "";
  const base64 = match[2] ?? "";
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_PHOTO_BYTES) throw new Error("Photo is larger than 2 MB. Please choose a smaller image.");
  return { mimeType, base64 };
}
