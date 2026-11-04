// Helpers shared by the profile actions.
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db.js";

export async function ensureProfile(ownerEmail: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.ownerEmail, ownerEmail));
  if (existing) return existing;
  const [created] = await db
    .insert(schema.profiles)
    .values({ ownerEmail, updatedAt: new Date().toISOString() })
    .returning();
  return created;
}

// Shared by the guest-readable HTTP endpoints. Only public profiles are returned.
export async function listPublicProfiles() {
  const db = getDb();
  const publicProfiles = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.isPublic, true));
  const active = await db
    .select()
    .from(schema.publications)
    .where(eq(schema.publications.status, "active"));
  const photos = await db
    .select({ ownerEmail: schema.profilePhotos.ownerEmail })
    .from(schema.profilePhotos);
  return publicProfiles.map((p) => ({
    ownerEmail: p.ownerEmail,
    firstName: p.firstName,
    lastName: p.lastName,
    university: p.university,
    position: p.position,
    department: p.department,
    bio: p.bio,
    hasPhoto: photos.some((ph) => ph.ownerEmail === p.ownerEmail),
    publicationCount: active.filter((a) => a.ownerEmail === p.ownerEmail).length,
  }));
}

export async function getPublicProfile(email: string) {
  const db = getDb();
  const [profile] = await db
    .select()
    .from(schema.profiles)
    .where(
      and(
        eq(schema.profiles.ownerEmail, email.trim().toLowerCase()),
        eq(schema.profiles.isPublic, true),
      ),
    );
  if (!profile) return null;
  // Only entries the owner has chosen to show are public.
  const entries = await db
    .select()
    .from(schema.profileEntries)
    .where(
      and(
        eq(schema.profileEntries.ownerEmail, profile.ownerEmail),
        eq(schema.profileEntries.visible, true),
      ),
    )
    .orderBy(asc(schema.profileEntries.createdAt));
  const publications = await db
    .select()
    .from(schema.publications)
    .where(
      and(
        eq(schema.publications.ownerEmail, profile.ownerEmail),
        eq(schema.publications.status, "active"),
      ),
    )
    .orderBy(desc(schema.publications.year), desc(schema.publications.createdAt));

  // Attach each shown entry's linked papers, keeping only active publications.
  const links = await db
    .select()
    .from(schema.entryPublications)
    .where(eq(schema.entryPublications.ownerEmail, profile.ownerEmail));
  const activeIds = new Set(publications.map((p) => p.id));
  const entriesWithPapers = entries.map((e) => ({
    ...e,
    papers: links
      .filter((l) => l.entryId === e.id && activeIds.has(l.publicationId))
      .map((l) => publications.find((p) => p.id === l.publicationId)!)
      .map((p) => ({ id: p.id, title: p.title, year: p.year, type: p.type, journal: p.journal, doi: p.doi, authors: p.authors })),
  }));
  const [photo] = await db
    .select({ ownerEmail: schema.profilePhotos.ownerEmail })
    .from(schema.profilePhotos)
    .where(eq(schema.profilePhotos.ownerEmail, profile.ownerEmail));
  return { profile, publications, entries: entriesWithPapers, hasPhoto: Boolean(photo) };
}

// A single publication, visible only when it is active and its owner's profile is public.
export async function getPublicPublication(id: string) {
  const db = getDb();
  const [pub] = await db
    .select()
    .from(schema.publications)
    .where(and(eq(schema.publications.id, id), eq(schema.publications.status, "active")));
  if (!pub) return null;
  const [profile] = await db
    .select()
    .from(schema.profiles)
    .where(
      and(
        eq(schema.profiles.ownerEmail, pub.ownerEmail),
        eq(schema.profiles.isPublic, true),
      ),
    );
  if (!profile) return null;
  return {
    publication: pub,
    author: {
      ownerEmail: profile.ownerEmail,
      firstName: profile.firstName,
      lastName: profile.lastName,
      university: profile.university,
    },
  };
}

export async function getPublicPhoto(email: string) {
  const db = getDb();
  const ownerEmail = email.trim().toLowerCase();
  const [profile] = await db
    .select()
    .from(schema.profiles)
    .where(and(eq(schema.profiles.ownerEmail, ownerEmail), eq(schema.profiles.isPublic, true)));
  if (!profile) return null;
  const [photo] = await db
    .select()
    .from(schema.profilePhotos)
    .where(eq(schema.profilePhotos.ownerEmail, ownerEmail));
  return photo ?? null;
}
