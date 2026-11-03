import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";

export default defineAction({
  description: "List the caller's personnel evaluations, most recently updated first.",
  schema: z.object({
    limit: z.number().int().min(1).max(500).default(200),
  }),
  http: { method: "GET" },
  run: async ({ limit }) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    return getDb()
      .select()
      .from(schema.evaluations)
      .where(eq(schema.evaluations.ownerEmail, ownerEmail))
      .orderBy(desc(schema.evaluations.updatedAt))
      .limit(limit);
  },
});
