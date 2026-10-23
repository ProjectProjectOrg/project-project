ALTER TABLE "project_everhour_integration" ADD COLUMN "sync_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_everhour_integration" ADD COLUMN "sync_claimed_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "project_everhour_integration_sync_requested_idx" ON "project_everhour_integration" ("sync_requested_at") WHERE "sync_requested_at" is not null;--> statement-breakpoint
UPDATE "project_integration_link" SET "subscribed_events" = '["sprint_created","sprint_renamed","sprint_completed","sprint_reopened","sprint_deleted"]'::jsonb WHERE "provider" = 'everhour';
