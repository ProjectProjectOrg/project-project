CREATE TABLE "organization_github_app" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"github_app_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"owner_login" text,
	"client_id" text NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_github_integration_project" (
	"organization_integration_id" uuid,
	"project_id" uuid,
	CONSTRAINT "organization_github_integration_project_pkey" PRIMARY KEY("organization_integration_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "github_app_install_session" ADD COLUMN "github_app_id" uuid;--> statement-breakpoint
ALTER TABLE "organization_github_integration" ADD COLUMN "github_app_id" uuid;--> statement-breakpoint
ALTER TABLE "organization_github_integration" ADD COLUMN "project_access" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_index" ADD COLUMN "repo_id" text;--> statement-breakpoint
DROP INDEX "organization_integration_active_provider_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "organization_integration_active_provider_uidx" ON "organization_integration" ("organization_id","provider") WHERE "status" = 'active' and "provider" <> 'github';--> statement-breakpoint
DROP INDEX "project_integration_link_active_provider_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "project_integration_link_active_provider_uidx" ON "project_integration_link" ("project_id","provider") WHERE "status" = 'active' and "provider" <> 'github';--> statement-breakpoint
CREATE UNIQUE INDEX "organization_github_app_org_app_uidx" ON "organization_github_app" ("organization_id","github_app_id");--> statement-breakpoint
CREATE INDEX "organization_github_app_github_app_idx" ON "organization_github_app" ("github_app_id");--> statement-breakpoint
CREATE INDEX "organization_github_integration_app_idx" ON "organization_github_integration" ("github_app_id");--> statement-breakpoint
CREATE INDEX "organization_github_integration_project_project_idx" ON "organization_github_integration_project" ("project_id");--> statement-breakpoint
ALTER TABLE "github_app_install_session" ADD CONSTRAINT "github_app_install_session_EQAC3c2eXkDg_fkey" FOREIGN KEY ("github_app_id") REFERENCES "organization_github_app"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_github_app" ADD CONSTRAINT "organization_github_app_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_github_integration" ADD CONSTRAINT "organization_github_integration_YbTieMRnFqqg_fkey" FOREIGN KEY ("github_app_id") REFERENCES "organization_github_app"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_github_integration_project" ADD CONSTRAINT "organization_github_integration_project_dsC7I7n8XuOp_fkey" FOREIGN KEY ("organization_integration_id") REFERENCES "organization_github_integration"("organization_integration_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "organization_github_integration_project" ADD CONSTRAINT "organization_github_integration_project_QgVpm7Zu4kk5_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;--> statement-breakpoint
UPDATE "ticket_index" SET "repo_id" = repo."repo_id"
FROM "project_integration_link" link
JOIN "project_github_repository" repo ON repo."project_integration_link_id" = link."id"
WHERE link."project_id" = "ticket_index"."project_id"
	AND link."provider" = 'github'
	AND link."status" = 'active'
	AND repo."status" = 'active'
	AND "ticket_index"."branch" IS NOT NULL;
