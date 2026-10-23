DELETE FROM "everhour_time_attribution";--> statement-breakpoint
ALTER TABLE "everhour_time_attribution" ADD COLUMN "everhour_entry_id" text;--> statement-breakpoint
ALTER TABLE "everhour_time_attribution" DROP CONSTRAINT "everhour_time_attribution_pkey";--> statement-breakpoint
ALTER TABLE "everhour_time_attribution" ADD PRIMARY KEY ("everhour_entry_id");--> statement-breakpoint
CREATE INDEX "everhour_time_attribution_time_idx" ON "everhour_time_attribution" ("everhour_time_id");