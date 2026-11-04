import { defineEventHandler, getQuery, setResponseHeader, setResponseStatus } from "h3";
import { getPublicPhoto } from "../../../profiles.js";

// Guest-readable: the photo of a public profile. Other profiles get 404.
export default defineEventHandler(async (event) => {
  const { email = "" } = getQuery<{ email?: string }>(event);
  const photo = await getPublicPhoto(String(email));
  if (!photo) {
    setResponseStatus(event, 404);
    return { error: "Photo not found" };
  }
  setResponseHeader(event, "content-type", photo.mimeType);
  setResponseHeader(event, "cache-control", "public, max-age=300");
  return Buffer.from(photo.base64, "base64");
});
