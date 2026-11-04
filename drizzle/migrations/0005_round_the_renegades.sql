CREATE TABLE "profile_photos" (
	"owner_email" text PRIMARY KEY NOT NULL,
	"mime_type" text NOT NULL,
	"base64" text NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
