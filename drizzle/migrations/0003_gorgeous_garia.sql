CREATE TABLE "preferences" (
	"owner_email" text PRIMARY KEY NOT NULL,
	"author_aliases" text DEFAULT '' NOT NULL,
	"keywords" text DEFAULT '' NOT NULL,
	"structural_unit" text DEFAULT '' NOT NULL,
	"sub_unit" text DEFAULT '' NOT NULL,
	"scopus_id" text DEFAULT '' NOT NULL,
	"wos_id" text DEFAULT '' NOT NULL,
	"orcid_id" text DEFAULT '' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"receive_alerts" boolean DEFAULT false NOT NULL,
	"auto_add_publications" boolean DEFAULT false NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"section" text NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"organisation" text DEFAULT '' NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"period" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"visible" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
