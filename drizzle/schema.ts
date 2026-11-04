// Personnel evaluation and researcher profile tables.
// Rows are private to the account that created them unless the profile is public.
import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text } from "drizzle-orm/pg-core";

export const evaluations = pgTable(
  "evaluations",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    employeeName: text("employee_name").notNull(),
    position: text("position").notNull().default(""),
    department: text("department").notNull().default(""),
    cycle: text("cycle").notNull().default(""),
    teaching: integer("teaching").notNull().default(0),
    research: integer("research").notNull().default(0),
    service: integer("service").notNull().default(0),
    comments: text("comments").notNull().default(""),
    status: text("status").notNull().default("draft"),
    createdAt: text("created_at").notNull().default(sql`now()`),
    updatedAt: text("updated_at").notNull().default(sql`now()`),
  },
  (t) => [
    check("evaluations_teaching_range", sql`${t.teaching} BETWEEN 0 AND 5`),
    check("evaluations_research_range", sql`${t.research} BETWEEN 0 AND 5`),
    check("evaluations_service_range", sql`${t.service} BETWEEN 0 AND 5`),
    check("evaluations_status_valid", sql`${t.status} IN ('draft', 'submitted')`),
  ],
);

export const profiles = pgTable("profiles", {
  ownerEmail: text("owner_email").primaryKey(),
  // Legacy display name from the first version; no longer shown. Kept so the
  // schema diff stays additive.
  displayName: text("display_name").notNull().default(""),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  birthDate: text("birth_date").notNull().default(""),
  university: text("university").notNull().default(""),
  position: text("position").notNull().default(""),
  department: text("department").notNull().default(""),
  bio: text("bio").notNull().default(""),
  isPublic: boolean("is_public").notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});

export const publications = pgTable(
  "publications",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    title: text("title").notNull(),
    year: integer("year").notNull(),
    type: text("type").notNull().default("Peer Reviewed Journal"),
    journal: text("journal").notNull().default(""),
    doi: text("doi").notNull().default(""),
    authors: text("authors").notNull().default(""),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`now()`),
    updatedAt: text("updated_at").notNull().default(sql`now()`),
  },
  (t) => [
    check("publications_year_range", sql`${t.year} BETWEEN 1900 AND 2100`),
    check("publications_status_valid", sql`${t.status} IN ('active', 'deleted')`),
  ],
);

// Owner preferences (manual section "Setup Preferences"). List values are stored one per line.
export const preferences = pgTable("preferences", {
  ownerEmail: text("owner_email").primaryKey(),
  authorAliases: text("author_aliases").notNull().default(""),
  keywords: text("keywords").notNull().default(""),
  structuralUnit: text("structural_unit").notNull().default(""),
  subUnit: text("sub_unit").notNull().default(""),
  scopusId: text("scopus_id").notNull().default(""),
  wosId: text("wos_id").notNull().default(""),
  orcidId: text("orcid_id").notNull().default(""),
  language: text("language").notNull().default("en"),
  receiveAlerts: boolean("receive_alerts").notNull().default(false),
  autoAddPublications: boolean("auto_add_publications").notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});

// Professional, teaching and research entries. `visible` controls whether the
// entry appears on the public profile; hidden entries are visible only to the owner.
export const profileEntries = pgTable("profile_entries", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  section: text("section").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  organisation: text("organisation").notNull().default(""),
  role: text("role").notNull().default(""),
  period: text("period").notNull().default(""),
  description: text("description").notNull().default(""),
  visible: boolean("visible").notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`now()`),
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});

// Links a publication to a research entry (e.g. a project). Both must belong to the owner.
export const entryPublications = pgTable("entry_publications", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  entryId: text("entry_id").notNull(),
  publicationId: text("publication_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

// Profile photo, stored separately from the profile so pages that don't need it stay small.
export const profilePhotos = pgTable("profile_photos", {
  ownerEmail: text("owner_email").primaryKey(),
  mimeType: text("mime_type").notNull(),
  base64: text("base64").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});

// Read-only sharing of a patent or research project with another person.
export const entryShares = pgTable("entry_shares", {
  id: text("id").primaryKey(),
  entryId: text("entry_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  sharedWithEmail: text("shared_with_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});
