ALTER TABLE "ticket_index" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
UPDATE "ticket_index" SET "type" = NULL WHERE "type" = 'other';