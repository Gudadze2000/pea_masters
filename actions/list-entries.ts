import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";

export default defineAction({
  description: "List the signed-in user's professional, teaching and research entries.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    return getDb()
      .select()
      .from(schema.profileEntries)
      .where(eq(schema.profileEntries.ownerEmail, ownerEmail))
      .orderBy(asc(schema.profileEntries.createdAt));
  },
});
