import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";

export default defineAction({
  description: "Remove a publication link from one of the signed-in user's research entries.",
  schema: z.object({ id: z.string().min(1) }),
  run: async ({ id }) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    const [row] = await getDb()
      .delete(schema.entryPublications)
      .where(and(eq(schema.entryPublications.id, id), eq(schema.entryPublications.ownerEmail, ownerEmail)))
      .returning();
    if (!row) fail("That link could not be found.", { statusCode: 404 });
    return { id };
  },
});
