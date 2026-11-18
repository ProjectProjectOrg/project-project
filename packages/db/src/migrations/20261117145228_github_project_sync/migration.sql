CREATE TABLE "github_project_sync" (
	"project_id" uuid PRIMARY KEY,
	"next_sync_at" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"failures" integer DEFAULT 0 NOT NULL,
	"token_status" text DEFAULT 'ok' NOT NULL,
	"repo_status" text DEFAULT 'ok' NOT NULL,
	"refresh_status" text,
	"retry_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "github_project_sync_next_idx" ON "github_project_sync" ("next_sync_at");--> statement-breakpoint
ALTER TABLE "github_project_sync" ADD CONSTRAINT "github_project_sync_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;