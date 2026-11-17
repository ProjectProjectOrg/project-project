CREATE TABLE "project_key" (
	"organization_id" text,
	"key" text,
	"project_id" uuid NOT NULL,
	"current" boolean NOT NULL,
	CONSTRAINT "project_key_pkey" PRIMARY KEY("organization_id","key")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "project_key_current_uidx" ON "project_key" ("project_id") WHERE "current";--> statement-breakpoint
ALTER TABLE "project_key" ADD CONSTRAINT "project_key_project_fkey" FOREIGN KEY ("project_id","organization_id") REFERENCES "project_index"("id","organization_id") ON DELETE CASCADE;--> statement-breakpoint
INSERT INTO "project_key" ("organization_id", "key", "project_id", "current") SELECT "organization_id", "key", "id", true FROM "project_index";

--> statement-breakpoint
ALTER TABLE "comment_index" ADD COLUMN "imported_name" text;--> statement-breakpoint
ALTER TABLE "comment_index" ADD COLUMN "imported_source" text;--> statement-breakpoint
ALTER TABLE "comment_index" ADD COLUMN "imported_id" text;--> statement-breakpoint
ALTER TABLE "ticket_activity" ADD COLUMN "imported_name" text;--> statement-breakpoint
ALTER TABLE "ticket_activity" ADD COLUMN "imported_source" text;--> statement-breakpoint
ALTER TABLE "ticket_activity" ADD COLUMN "imported_id" text;--> statement-breakpoint
ALTER TABLE "ticket_activity" ADD CONSTRAINT "ticket_activity_imported_actor_check" CHECK (("actor_kind" = 'imported') = (
        "imported_name" is not null
        and "imported_source" is not null
        and "imported_id" is not null
      ));--> statement-breakpoint
ALTER TABLE "comment_index" DROP CONSTRAINT "comment_index_attribution_check";--> statement-breakpoint
UPDATE "comment_index" SET "author_kind" = 'imported', "imported_name" = "jira_display_name", "imported_source" = 'jira', "imported_id" = "jira_account_id" WHERE "author_kind" = 'jira';--> statement-breakpoint
ALTER TABLE "comment_index" ADD CONSTRAINT "comment_index_attribution_check" CHECK ((
        "author_kind" = 'user'
        and "author_id" is not null
        and "imported_name" is null
        and "imported_source" is null
        and "imported_id" is null
      ) or (
        "author_kind" = 'imported'
        and "author_id" is null
        and "imported_name" is not null
        and "imported_source" is not null
        and "imported_id" is not null
      ));--> statement-breakpoint
ALTER TABLE "comment_index" DROP CONSTRAINT "comment_index_origin_check", ADD CONSTRAINT "comment_index_origin_check" CHECK ("origin" <> 'native' or "author_kind" = 'user');--> statement-breakpoint
ALTER TABLE "ticket_activity" DROP CONSTRAINT "ticket_activity_actor_check", ADD CONSTRAINT "ticket_activity_actor_check" CHECK ((
        "actor_kind" = 'user'
        and "actor_user_id" is not null
        and "actor_client_id" is null
        and "actor_client_name" is null
        and "actor_source" is null
      ) or (
        "actor_kind" = 'agent'
        and "actor_user_id" is not null
        and "actor_client_id" is not null
        and "actor_client_name" is not null
        and "actor_source" is null
      ) or (
        "actor_kind" = 'system'
        and "actor_user_id" is null
        and "actor_client_id" is null
        and "actor_client_name" is null
        and "actor_source" is not null
      ) or (
        "actor_kind" = 'imported'
        and "actor_user_id" is null
        and "actor_client_id" is null
        and "actor_client_name" is null
        and "actor_source" is null
      ));
--> statement-breakpoint
ALTER TABLE "comment_index" DROP COLUMN "jira_display_name";--> statement-breakpoint
ALTER TABLE "comment_index" DROP COLUMN "jira_account_id";
--> statement-breakpoint
CREATE TABLE "project_import" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"status" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"manifest" jsonb,
	"files" jsonb,
	"attachments" jsonb,
	"configuration" jsonb,
	"destination_project_id" uuid,
	"destination_project_slug" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retained_until" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "project_import_org_idx" ON "project_import" ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "project_import_retention_idx" ON "project_import" ("retained_until");--> statement-breakpoint
ALTER TABLE "project_import" ADD CONSTRAINT "project_import_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;