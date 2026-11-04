import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";

// Returns the signed-in user's photo as a data URL, or null if none is set.
export default defineAction({
  description: "Get the signed-in user's profile photo.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    const [row] = await getDb()
      .select()
      .from(schema.profilePhotos)
      .where(eq(schema.profilePhotos.ownerEmail, ownerEmail));
    return row ? { dataUrl: `data:${row.mimeType};base64,${row.base64}` } : { dataUrl: null };
  },
});
