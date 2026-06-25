CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_slug" text NOT NULL,
	"name" text NOT NULL,
	"season" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_edited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"race_date" text,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "races_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX "projects_race_slug_idx" ON "projects" USING btree ("race_slug");