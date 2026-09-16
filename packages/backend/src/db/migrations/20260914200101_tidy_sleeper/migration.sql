CREATE TABLE "jira_migration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"request_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"initiated_by" text NOT NULL,
	"source_cloud_id" text NOT NULL,
	"source_site_name" text NOT NULL,
	"source_site_url" text NOT NULL,
	"source_project_id" text NOT NULL,
	"source_project_key" text NOT NULL,
	"source_project_name" text NOT NULL,
	"status" text DEFAULT 'scanning' NOT NULL,
	"phase" text DEFAULT 'queued_scan' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"manifest_version" integer DEFAULT 1 NOT NULL,
	"staging_prefix" text NOT NULL,
	"configuration" jsonb,
	"checkpoint" jsonb,
	"progress_done" integer DEFAULT 0 NOT NULL,
	"progress_total" integer,
	"lease_id" uuid,
	"lease_expires_at" timestamp with time zone,
	"scan_at" timestamp with time zone,
	"destination_project_id" uuid,
	"destination_project_slug" text,
	"report_path" text,
	"failure_reason" text,
	"failure_retryable" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "jira_migration_request_uidx" ON "jira_migration" ("initiated_by","organization_id","request_id");--> statement-breakpoint
CREATE INDEX "jira_migration_initiator_idx" ON "jira_migration" ("organization_id","initiated_by","created_at");--> statement-breakpoint
CREATE INDEX "jira_migration_worker_idx" ON "jira_migration" ("status","lease_expires_at");--> statement-breakpoint
ALTER TABLE "jira_migration" ADD CONSTRAINT "jira_migration_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "jira_migration" ADD CONSTRAINT "jira_migration_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by") REFERENCES "user"("id") ON DELETE CASCADE;