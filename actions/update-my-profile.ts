import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { ensureProfile } from "../server/profiles.js";

export default defineAction({
  description: "Update the signed-in user's profile details and public/private visibility.",
  schema: z.object({
    firstName: z.string().trim().max(80).default(""),
    lastName: z.string().trim().max(80).default(""),
    birthDate: z
      .string()
      .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use the format YYYY-MM-DD")
      .default(""),
    university: z.string().trim().max(200).default(""),
    position: z.string().trim().max(120).default(""),
    department: z.string().trim().max(120).default(""),
    bio: z.string().max(5000).default(""),
    isPublic: z.boolean(),
  }),
  run: async (input) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    await ensureProfile(ownerEmail);
    const [row] = await getDb()
      .update(schema.profiles)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(eq(schema.profiles.ownerEmail, ownerEmail))
      .returning();
    return row;
  },
});
