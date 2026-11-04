import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";

// Permanently deletes one of the signed-in user's publications, together with any
// research links to it. Only removed (deleted) publications can be deleted this way.
export default defineAction({
  description: "Permanently delete a removed publication from the signed-in user's profile.",
  schema: z.object({ id: z.string().min(1) }),
  run: async ({ id }) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    const db = getDb();
    const [pub] = await db
      .select()
      .from(schema.publications)
      .where(and(eq(schema.publications.id, id), eq(schema.publications.ownerEmail, ownerEmail)));
    if (!pub) fail("That publication could not be found.", { statusCode: 404 });
    if (pub.status !== "deleted") {
      fail("Remove the publication from your profile first, then delete it permanently.", { statusCode: 400 });
    }
    await db
      .delete(schema.entryPublications)
      .where(and(eq(schema.entryPublications.publicationId, id), eq(schema.entryPublications.ownerEmail, ownerEmail)));
    await db
      .delete(schema.publications)
      .where(and(eq(schema.publications.id, id), eq(schema.publications.ownerEmail, ownerEmail)));
    return { id };
  },
});
