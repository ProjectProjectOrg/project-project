ALTER TABLE "project_index" ADD COLUMN "estimation" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_index" ADD COLUMN "estimate_unit" text;--> statement-breakpoint
ALTER TABLE "ticket_index" ADD COLUMN "estimate_value" integer;