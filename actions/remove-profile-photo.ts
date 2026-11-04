import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";

export default defineAction({
  description: "Remove the signed-in user's profile photo.",
  schema: z.object({}),
  run: async () => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    await getDb().delete(schema.profilePhotos).where(eq(schema.profilePhotos.ownerEmail, ownerEmail));
    return { ok: true };
  },
});
