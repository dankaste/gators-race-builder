CREATE TABLE "directors" (
	"email" text PRIMARY KEY NOT NULL,
	"name" text,
	"image" text,
	"added_by_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
