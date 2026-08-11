ALTER TABLE "race_history_imports" ADD COLUMN "source" text DEFAULT 'bulk-history' NOT NULL;--> statement-breakpoint
ALTER TABLE "race_history_results" ADD COLUMN "bib" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "race_history_results_race_season_bib_idx" ON "race_history_results" USING btree ("race_slug","season","bib");