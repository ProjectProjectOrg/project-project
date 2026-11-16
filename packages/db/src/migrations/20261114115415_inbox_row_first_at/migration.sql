ALTER TABLE "inbox_row" ADD COLUMN "first_at" timestamp with time zone;--> statement-breakpoint
UPDATE "inbox_row" SET "first_at" = "latest_at";--> statement-breakpoint
ALTER TABLE "inbox_row" ALTER COLUMN "first_at" SET NOT NULL;
