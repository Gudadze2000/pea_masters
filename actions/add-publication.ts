import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";

export const PUBLICATION_TYPES = [
  "Peer Reviewed Journal",
  "Conference Contribution",
  "Book",
  "Book Chapter",
  "Patent",
  "Other",
] as const;

export default defineAction({
  description: "Add a publication to the signed-in user's profile.",
  schema: z.object({
    title: z.string().trim().min(1, "Title is required").max(500),
    year: z.number().int().min(1900).max(2100),
    type: z.enum(PUBLICATION_TYPES).default("Peer Reviewed Journal"),
    journal: z.string().trim().max(300).default(""),
    doi: z.string().trim().max(200).default(""),
    authors: z.string().trim().max(1000).default(""),
  }),
  run: async (input) => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    const db = getDb();
    const active = await db
      .select()
      .from(schema.publications)
      .where(
        and(
          eq(schema.publications.ownerEmail, ownerEmail),
          eq(schema.publications.status, "active"),
        ),
      );
    const duplicate = active.find(
      (p) =>
        (input.doi && p.doi.toLowerCase() === input.doi.toLowerCase()) ||
        (p.title.toLowerCase() === input.title.toLowerCase() && p.year === input.year),
    );
    if (duplicate) fail("This publication is already on your profile.", { statusCode: 409 });
    const now = new Date().toISOString();
    const [row] = await db
      .insert(schema.publications)
      .values({
        id: crypto.randomUUID(),
        ownerEmail,
        ...input,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return row;
  },
});
