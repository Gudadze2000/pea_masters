import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";

export default defineAction({
  description: "List which of the signed-in user's publications are linked to which research entries.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    return getDb()
      .select()
      .from(schema.entryPublications)
      .where(eq(schema.entryPublications.ownerEmail, ownerEmail));
  },
});
