ALTER TABLE "ticket_index" ADD COLUMN "sprint_id" text;--> statement-breakpoint
CREATE INDEX "ticket_index_sprint_idx" ON "ticket_index" ("project_id","sprint_id");