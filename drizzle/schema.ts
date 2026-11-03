// Personnel evaluation tables. Each evaluation is private to the account that
// created it: every action filters by the signed-in user's email.
import { sql } from "drizzle-orm";
import { check, integer, pgTable, text } from "drizzle-orm/pg-core";

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
