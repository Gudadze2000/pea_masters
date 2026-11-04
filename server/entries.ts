// Shared helpers for preferences and profile entries.
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db.js";

export async function ensurePreferences(ownerEmail: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.preferences)
    .where(eq(schema.preferences.ownerEmail, ownerEmail));
  if (existing) return existing;
  const [created] = await db
    .insert(schema.preferences)
    .values({ ownerEmail, updatedAt: new Date().toISOString() })
    .returning();
  return created;
}
