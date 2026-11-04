import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { ALL_CATEGORY_VALUES, sectionForCategory } from "../app/lib/profile-categories.js";
import { getDb, schema } from "../server/db.js";

const entryFields = {
  category: z
    .string()
    .refine((v) => ALL_CATEGORY_VALUES.includes(v), "Choose a category from the list"),
  title: z.string().trim().min(1, "Title is required").max(300),
  organisation: z.string().trim().max(300).default(""),
  role: z.string().trim().max(200).default(""),
  period: z.string().trim().max(100).default(""),
  description: z.string().max(3000).default(""),
  visible: z.boolean().default(false),
};

// Creates an entry when `id` is absent, otherwise updates the caller's own entry.
export default defineAction({
  description: "Add or update a professional, teaching or research entry on the signed-in user's profile.",
  schema: z.object({ id: z.string().min(1).optional(), ...entryFields }),
  run: async ({ id, ...input }) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    const section = sectionForCategory(input.category);
    if (!section) fail("Choose a category from the list", { statusCode: 400 });
    const db = getDb();
    const now = new Date().toISOString();

    if (!id) {
      const [row] = await db
        .insert(schema.profileEntries)
        .values({ id: crypto.randomUUID(), ownerEmail, section, ...input, createdAt: now, updatedAt: now })
        .returning();
      return row;
    }

    const [row] = await db
      .update(schema.profileEntries)
      .set({ section, ...input, updatedAt: now })
      .where(and(eq(schema.profileEntries.id, id), eq(schema.profileEntries.ownerEmail, ownerEmail)))
      .returning();
    if (!row) fail("Entry not found", { statusCode: 404 });
    return row;
  },
});
