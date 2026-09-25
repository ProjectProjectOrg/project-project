DROP INDEX "jira_migration_worker_idx";--> statement-breakpoint
ALTER TABLE "jira_migration" DROP COLUMN "lease_id";--> statement-breakpoint
ALTER TABLE "jira_migration" DROP COLUMN "lease_expires_at";