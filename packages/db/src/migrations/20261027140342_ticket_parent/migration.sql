ALTER TABLE "ticket_index" ADD COLUMN "parent" text;--> statement-breakpoint
CREATE INDEX "ticket_index_parent_idx" ON "ticket_index" ("project_id","parent");