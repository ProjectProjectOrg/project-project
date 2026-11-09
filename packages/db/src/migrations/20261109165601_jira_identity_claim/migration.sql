CREATE TABLE "jira_identity_claim" (
	"project_id" uuid,
	"email" text,
	"jira_account_ids" text[] NOT NULL,
	"assignee_ticket_ids" text[] NOT NULL,
	"reporter_ticket_ids" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jira_identity_claim_pkey" PRIMARY KEY("project_id","email")
);
--> statement-breakpoint
CREATE INDEX "jira_identity_claim_email_idx" ON "jira_identity_claim" ("email");--> statement-breakpoint
ALTER TABLE "jira_identity_claim" ADD CONSTRAINT "jira_identity_claim_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;