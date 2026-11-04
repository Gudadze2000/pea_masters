import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";

export default defineAction({
  description: "Stop sharing one of the signed-in user's items with a person.",
  schema: z.object({ id: z.string().min(1) }),
  run: async ({ id }) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    const [row] = await getDb()
      .delete(schema.entryShares)
      .where(and(eq(schema.entryShares.id, id), eq(schema.entryShares.ownerEmail, ownerEmail)))
      .returning();
    if (!row) fail("That share could not be found.", { statusCode: 404 });
    return { id };
  },
});
