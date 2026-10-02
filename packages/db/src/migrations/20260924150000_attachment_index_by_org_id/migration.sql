DROP INDEX "attachment_index_org_created_idx";--> statement-breakpoint
CREATE INDEX "attachment_index_org_created_idx" ON "attachment_index" ("organization_id","created_at");--> statement-breakpoint
DROP INDEX "attachment_index_org_size_idx";--> statement-breakpoint
CREATE INDEX "attachment_index_org_size_idx" ON "attachment_index" ("organization_id","byte_size");