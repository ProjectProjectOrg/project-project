CREATE TABLE "project_git_automation" (
	"project_id" uuid,
	"event" text,
	"status_slug" text NOT NULL,
	CONSTRAINT "project_git_automation_pkey" PRIMARY KEY("project_id","event")
);
--> statement-breakpoint
ALTER TABLE "project_index" ADD COLUMN "git_automation_forward_only" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_index" ADD COLUMN "pr_draft" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_index" ADD COLUMN "pr_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_git_automation" ADD CONSTRAINT "project_git_automation_status_fkey" FOREIGN KEY ("project_id","status_slug") REFERENCES "project_status"("project_id","slug") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
INSERT INTO "project_git_automation" ("project_id","event","status_slug") SELECT "project_id",'pr_merged','done' FROM "project_status" WHERE "slug" = 'done' ON CONFLICT DO NOTHING;
