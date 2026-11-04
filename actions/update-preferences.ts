import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { ensurePreferences } from "../server/entries.js";

export default defineAction({
  description: "Update the signed-in user's preferences.",
  schema: z.object({
    authorAliases: z.string().max(4000).default(""),
    keywords: z.string().max(4000).default(""),
    structuralUnit: z.string().trim().max(200).default(""),
    subUnit: z.string().trim().max(200).default(""),
    scopusId: z.string().trim().max(50).default(""),
    wosId: z.string().trim().max(50).default(""),
    orcidId: z.string().trim().max(50).default(""),
    language: z.enum(["en", "ka"]).default("en"),
    receiveAlerts: z.boolean().default(false),
    autoAddPublications: z.boolean().default(false),
  }),
  run: async (input) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    await ensurePreferences(ownerEmail);
    const [row] = await getDb()
      .update(schema.preferences)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(eq(schema.preferences.ownerEmail, ownerEmail))
      .returning();
    return row;
  },
});
