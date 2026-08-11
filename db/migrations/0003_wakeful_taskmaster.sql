CREATE TABLE "race_history_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text NOT NULL,
	"row_count" integer NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_by_email" text
);
--> statement-breakpoint
CREATE TABLE "race_history_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"name_key" text NOT NULL,
	"race_slug" text,
	"season" integer,
	"event_label" text NOT NULL,
	"category" text NOT NULL,
	"age_on_race_day" integer,
	"gender" text,
	"time_seconds" double precision,
	"status" text NOT NULL,
	"place" integer,
	"group_size" integer,
	"distance_label" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "race_history_results" ADD CONSTRAINT "race_history_results_import_id_race_history_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."race_history_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "race_history_results_import_idx" ON "race_history_results" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "race_history_results_name_key_idx" ON "race_history_results" USING btree ("name_key");