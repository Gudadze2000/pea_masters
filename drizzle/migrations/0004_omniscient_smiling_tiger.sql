CREATE TABLE "entry_publications" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"entry_id" text NOT NULL,
	"publication_id" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
