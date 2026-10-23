ALTER TABLE "project_everhour_integration" ADD COLUMN "sync_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_everhour_integration" ADD COLUMN "sync_claimed_until" timestamp with time zone;--> statement-breakpoint
UPDATE "project_integration_link" SET "subscribed_events" = '["sprint_created","sprint_renamed","sprint_completed","sprint_reopened","sprint_deleted"]'::jsonb WHERE "provider" = 'everhour';
