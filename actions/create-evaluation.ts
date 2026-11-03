import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { evaluationFields } from "../server/evaluation-fields.js";

export default defineAction({
  description: "Create a personnel evaluation owned by the caller.",
  schema: z.object(evaluationFields),
  run: async (input) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    const now = new Date().toISOString();
    const [row] = await getDb()
      .insert(schema.evaluations)
      .values({
        id: crypto.randomUUID(),
        ownerEmail,
        ...input,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return row;
  },
});
