import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";

// Deleting a publication only removes it from the profile; it can be restored.
export default defineAction({
  description: "Remove a publication from, or restore it to, the signed-in user's profile.",
  schema: z.object({
    id: z.string().min(1),
    status: z.enum(["active", "deleted"]),
  }),
  run: async ({ id, status }) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    const [row] = await getDb()
      .update(schema.publications)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.publications.id, id),
          eq(schema.publications.ownerEmail, ownerEmail),
        ),
      )
      .returning();
    if (!row) fail("Publication not found", { statusCode: 404 });
    return row;
  },
});
