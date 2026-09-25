ALTER TABLE "jira_migration" ADD COLUMN "workflow_execution_id" text;--> statement-breakpoint
ALTER TABLE "jira_migration" ADD COLUMN "workflow_attempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jira_migration" ADD COLUMN "scan_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jira_migration" ADD COLUMN "failure_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "jira_migration" ADD COLUMN "retained_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jira_migration" ADD COLUMN "cleanup_execution_id" text;--> statement-breakpoint
ALTER TABLE "project_index" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
UPDATE project_index
SET published_at = created_at
WHERE published_at IS NULL;--> statement-breakpoint
ALTER TABLE "project_index" ALTER COLUMN "published_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "jira_migration" ALTER COLUMN "id" SET DATA TYPE text USING "id"::text;--> statement-breakpoint
ALTER TABLE "jira_migration" ALTER COLUMN "id" DROP DEFAULT;
