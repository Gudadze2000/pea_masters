import { defineEventHandler, getQuery, setResponseStatus } from "h3";
import { getPublicProfile } from "../../../profiles.js";

// Guest-readable: one public profile. The email is a query parameter, so it never
// appears in the URL path. Private or unknown emails return 404.
export default defineEventHandler(async (event) => {
  const { email = "" } = getQuery<{ email?: string }>(event);
  const result = await getPublicProfile(String(email));
  if (!result) {
    setResponseStatus(event, 404);
    return { error: "Profile not found" };
  }
  return result;
});
