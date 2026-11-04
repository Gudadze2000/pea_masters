import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";

export default defineAction({
  description: "Link one of the signed-in user's publications to one of their research entries.",
  schema: z.object({
    entryId: z.string().min(1),
    publicationId: z.string().min(1),
  }),
  run: async ({ entryId, publicationId }) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    const db = getDb();

    const [entry] = await db
      .select()
      .from(schema.profileEntries)
      .where(and(eq(schema.profileEntries.id, entryId), eq(schema.profileEntries.ownerEmail, ownerEmail)));
    if (!entry) fail("That research item could not be found.", { statusCode: 404 });
    if (entry.section !== "research") fail("Papers can only be linked to research items.", { statusCode: 400 });

    const [pub] = await db
      .select()
      .from(schema.publications)
      .where(and(eq(schema.publications.id, publicationId), eq(schema.publications.ownerEmail, ownerEmail)));
    if (!pub || pub.status !== "active") fail("That publication could not be found.", { statusCode: 404 });

    const [existing] = await db
      .select()
      .from(schema.entryPublications)
      .where(
        and(
          eq(schema.entryPublications.entryId, entryId),
          eq(schema.entryPublications.publicationId, publicationId),
        ),
      );
    if (existing) fail("This paper is already linked to this item.", { statusCode: 409 });

    const [row] = await db
      .insert(schema.entryPublications)
      .values({ id: crypto.randomUUID(), ownerEmail, entryId, publicationId })
      .returning();
    return row;
  },
});
