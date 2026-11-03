import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";

export default defineAction({
  description: "Delete one of the caller's personnel evaluations by id.",
  schema: z.object({ id: z.string().min(1) }),
  http: { method: "DELETE" },
  run: async ({ id }) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    const [row] = await getDb()
      .delete(schema.evaluations)
      .where(
        and(
          eq(schema.evaluations.id, id),
          eq(schema.evaluations.ownerEmail, ownerEmail),
        ),
      )
      .returning();
    if (!row) fail("Evaluation not found", { statusCode: 404 });
    return { id };
  },
});
