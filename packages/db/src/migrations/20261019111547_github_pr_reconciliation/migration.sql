CREATE TABLE "github_pull_request_reconciliation" (
	"repository_id" text,
	"number" integer,
	"branch" text NOT NULL,
	"base" text NOT NULL,
	"state" text NOT NULL,
	"updated_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	CONSTRAINT "github_pull_request_reconciliation_pkey" PRIMARY KEY("repository_id","number")
);
--> statement-breakpoint
CREATE INDEX "github_pr_reconciliation_branch_idx" ON "github_pull_request_reconciliation" ("repository_id","branch");