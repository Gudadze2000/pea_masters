import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { SHAREABLE_CATEGORIES } from "../app/lib/profile-categories.js";
import { getDb, schema } from "../server/db.js";

export default defineAction({
  description: "Share one of the signed-in user's patents or research projects with another person (view only).",
  schema: z.object({
    entryId: z.string().min(1),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  }),
  run: async ({ entryId, email }) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    if (email === ownerEmail) fail("You already own this item.", { statusCode: 400 });
    const db = getDb();

    const [entry] = await db
      .select()
      .from(schema.profileEntries)
      .where(and(eq(schema.profileEntries.id, entryId), eq(schema.profileEntries.ownerEmail, ownerEmail)));
    if (!entry) fail("That item could not be found.", { statusCode: 404 });
    if (!SHAREABLE_CATEGORIES.includes(entry.category)) {
      fail("Only patents and research projects can be shared.", { statusCode: 400 });
    }

    const [existing] = await db
      .select()
      .from(schema.entryShares)
      .where(and(eq(schema.entryShares.entryId, entryId), eq(schema.entryShares.sharedWithEmail, email)));
    if (existing) fail("This item is already shared with that person.", { statusCode: 409 });

    const [row] = await db
      .insert(schema.entryShares)
      .values({ id: crypto.randomUUID(), entryId, ownerEmail, sharedWithEmail: email })
      .returning();
    return row;
  },
});
