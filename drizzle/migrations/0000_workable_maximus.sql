CREATE TABLE "evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_email" text NOT NULL,
	"employee_name" text NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"cycle" text DEFAULT '' NOT NULL,
	"teaching" integer DEFAULT 0 NOT NULL,
	"research" integer DEFAULT 0 NOT NULL,
	"service" integer DEFAULT 0 NOT NULL,
	"comments" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "evaluations_teaching_range" CHECK ("evaluations"."teaching" BETWEEN 0 AND 5),
	CONSTRAINT "evaluations_research_range" CHECK ("evaluations"."research" BETWEEN 0 AND 5),
	CONSTRAINT "evaluations_service_range" CHECK ("evaluations"."service" BETWEEN 0 AND 5),
	CONSTRAINT "evaluations_status_valid" CHECK ("evaluations"."status" IN ('draft', 'submitted'))
);
