import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { parsePhotoDataUrl } from "../server/photos.js";

export default defineAction({
  description: "Set or replace the signed-in user's profile photo (JPEG, PNG or WebP, up to 2 MB).",
  schema: z.object({ dataUrl: z.string().max(3_000_000) }),
  run: async ({ dataUrl }) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    let parsed;
    try {
      parsed = parsePhotoDataUrl(dataUrl);
    } catch (err) {
      fail(err instanceof Error ? err.message : "Photo could not be read.", { statusCode: 400 });
    }
    const db = getDb();
    const now = new Date().toISOString();
    const [existing] = await db
      .select()
      .from(schema.profilePhotos)
      .where(eq(schema.profilePhotos.ownerEmail, ownerEmail));
    if (existing) {
      await db
        .update(schema.profilePhotos)
        .set({ ...parsed, updatedAt: now })
        .where(eq(schema.profilePhotos.ownerEmail, ownerEmail));
    } else {
      await db.insert(schema.profilePhotos).values({ ownerEmail, ...parsed, updatedAt: now });
    }
    return { ok: true };
  },
});
