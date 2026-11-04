CREATE TABLE "entry_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"owner_email" text NOT NULL,
	"shared_with_email" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
