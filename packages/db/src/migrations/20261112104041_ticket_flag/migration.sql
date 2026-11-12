ALTER TABLE "ticket_index" ADD COLUMN "flag_reason" text;--> statement-breakpoint
ALTER TABLE "ticket_index" ADD COLUMN "flagged_by" text;--> statement-breakpoint
ALTER TABLE "ticket_index" ADD COLUMN "flagged_at" timestamp with time zone;