ALTER TABLE "profiles" ADD COLUMN "first_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "last_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "birth_date" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "university" text DEFAULT '' NOT NULL;