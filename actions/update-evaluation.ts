import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { evaluationFields } from "../server/evaluation-fields.js";

export default defineAction({
  description: "Update one of the caller's personnel evaluations by id.",
  schema: z.object({
    id: z.string().min(1),
    ...evaluationFields,
  }),
  run: async ({ id, ...input }) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    const [row] = await getDb()
      .update(schema.evaluations)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(schema.evaluations.id, id),
          eq(schema.evaluations.ownerEmail, ownerEmail),
        ),
      )
      .returning();
    if (!row) fail("Evaluation not found", { statusCode: 404 });
    return row;
  },
});
