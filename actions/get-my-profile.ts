import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { ensureProfile } from "../server/profiles.js";

export default defineAction({
  description: "Get the signed-in user's profile, active publications and deleted publications.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    const profile = await ensureProfile(ownerEmail);
    const rows = await getDb()
      .select()
      .from(schema.publications)
      .where(eq(schema.publications.ownerEmail, ownerEmail))
      .orderBy(desc(schema.publications.year), desc(schema.publications.createdAt));
    return {
      profile,
      publications: rows.filter((p) => p.status === "active"),
      deleted: rows.filter((p) => p.status === "deleted"),
    };
  },
});
