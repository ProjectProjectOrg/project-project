ALTER TABLE "ticket_index" ADD COLUMN "moved_from" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "ticket_index_moved_from_idx" ON "ticket_index" USING gin ("moved_from");