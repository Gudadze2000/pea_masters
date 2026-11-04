CREATE TABLE "profiles" (
	"owner_email" text PRIMARY KEY NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"title" text NOT NULL,
	"year" integer NOT NULL,
	"type" text DEFAULT 'Peer Reviewed Journal' NOT NULL,
	"journal" text DEFAULT '' NOT NULL,
	"doi" text DEFAULT '' NOT NULL,
	"authors" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "publications_year_range" CHECK ("publications"."year" BETWEEN 1900 AND 2100),
	CONSTRAINT "publications_status_valid" CHECK ("publications"."status" IN ('active', 'deleted'))
);
