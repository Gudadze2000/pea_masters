import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";

// Items other people have shared with the signed-in user. Read-only for the recipient.
export default defineAction({
  description: "List patents and research projects that other people have shared with the signed-in user.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const me = getRequestUserEmail();
    if (!me) fail("Not authenticated", { statusCode: 401 });
    const db = getDb();
    const shares = await db
      .select()
      .from(schema.entryShares)
      .where(eq(schema.entryShares.sharedWithEmail, me));
    if (shares.length === 0) return [];
    const entries = await db
      .select()
      .from(schema.profileEntries)
      .where(inArray(schema.profileEntries.id, shares.map((s) => s.entryId)));
    const owners = await db
      .select()
      .from(schema.profiles)
      .where(inArray(schema.profiles.ownerEmail, [...new Set(shares.map((s) => s.ownerEmail))]));
    return shares
      .map((s) => {
        const entry = entries.find((e) => e.id === s.entryId);
        if (!entry) return null;
        const owner = owners.find((o) => o.ownerEmail === s.ownerEmail);
        const ownerName = owner ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") : "";
        return { ...entry, ownerEmail: s.ownerEmail, ownerName: ownerName || s.ownerEmail };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  },
});
