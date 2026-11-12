ALTER TABLE "ticket_index" ADD COLUMN "rank" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_index" ALTER COLUMN "rank" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "ticket_index_rank_idx" ON "ticket_index" ("project_id","rank" collate "C");
