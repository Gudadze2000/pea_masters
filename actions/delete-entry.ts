import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";

export default defineAction({
  description: "Delete one of the signed-in user's profile entries.",
  schema: z.object({ id: z.string().min(1) }),
  run: async ({ id }) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    const db = getDb();
    // Remove paper links first so no orphaned links remain.
    await db
      .delete(schema.entryPublications)
      .where(and(eq(schema.entryPublications.entryId, id), eq(schema.entryPublications.ownerEmail, ownerEmail)));
    await db
      .delete(schema.entryShares)
      .where(and(eq(schema.entryShares.entryId, id), eq(schema.entryShares.ownerEmail, ownerEmail)));
    const [row] = await db
      .delete(schema.profileEntries)
      .where(and(eq(schema.profileEntries.id, id), eq(schema.profileEntries.ownerEmail, ownerEmail)))
      .returning();
    if (!row) fail("Entry not found", { statusCode: 404 });
    return { id };
  },
});
