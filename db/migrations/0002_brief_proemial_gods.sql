CREATE TABLE "race_day_check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"player_id" text NOT NULL,
	"checked_in" boolean DEFAULT true NOT NULL,
	"checked_in_at" timestamp with time zone,
	"recorded_by" text,
	"idempotency_key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_day_dnf_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"player_id" text NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"marked_by" text,
	"note" text,
	"idempotency_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_day_evac_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triggered_by" text,
	"cleared_at" timestamp with time zone,
	"cleared_by" text
);
--> statement-breakpoint
CREATE TABLE "race_day_finish_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"sort_order" integer NOT NULL,
	"player_id" text,
	"bib" text NOT NULL,
	"edited_time" timestamp with time zone,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_day_finish_time_taps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" text NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "race_day_finish_time_taps_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "race_day_finish_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"device" text,
	"started_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer NOT NULL,
	"file_path" text NOT NULL,
	"file_size_bytes" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_day_idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"route" text NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_day_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"player_id" text,
	"type" text NOT NULL,
	"note" text,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reported_by" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"idempotency_key" text NOT NULL,
	CONSTRAINT "race_day_incidents_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "race_day_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh_key" text NOT NULL,
	"auth_key" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "race_day_push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "race_day_start_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"player_id" text NOT NULL,
	"wave" integer NOT NULL,
	"status" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" text,
	"idempotency_key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_day_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_email" text,
	CONSTRAINT "race_day_tokens_project_id_unique" UNIQUE("project_id"),
	CONSTRAINT "race_day_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "race_day_wave_starts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"wave" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"recorded_by" text,
	"idempotency_key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "race_day_check_ins" ADD CONSTRAINT "race_day_check_ins_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_day_dnf_marks" ADD CONSTRAINT "race_day_dnf_marks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_day_evac_events" ADD CONSTRAINT "race_day_evac_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_day_finish_order" ADD CONSTRAINT "race_day_finish_order_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_day_finish_time_taps" ADD CONSTRAINT "race_day_finish_time_taps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_day_finish_videos" ADD CONSTRAINT "race_day_finish_videos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_day_idempotency_keys" ADD CONSTRAINT "race_day_idempotency_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_day_incidents" ADD CONSTRAINT "race_day_incidents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_day_push_subscriptions" ADD CONSTRAINT "race_day_push_subscriptions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_day_start_marks" ADD CONSTRAINT "race_day_start_marks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_day_tokens" ADD CONSTRAINT "race_day_tokens_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_day_wave_starts" ADD CONSTRAINT "race_day_wave_starts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "race_day_check_ins_project_event_player_idx" ON "race_day_check_ins" USING btree ("project_id","event_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "race_day_dnf_marks_project_event_player_idx" ON "race_day_dnf_marks" USING btree ("project_id","event_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "race_day_evac_events_active_idx" ON "race_day_evac_events" USING btree ("project_id") WHERE "race_day_evac_events"."cleared_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "race_day_finish_order_project_event_sort_idx" ON "race_day_finish_order" USING btree ("project_id","event_id","sort_order");--> statement-breakpoint
CREATE INDEX "race_day_finish_time_taps_project_event_idx" ON "race_day_finish_time_taps" USING btree ("project_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "race_day_start_marks_project_event_player_idx" ON "race_day_start_marks" USING btree ("project_id","event_id","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "race_day_wave_starts_project_event_wave_idx" ON "race_day_wave_starts" USING btree ("project_id","event_id","wave");