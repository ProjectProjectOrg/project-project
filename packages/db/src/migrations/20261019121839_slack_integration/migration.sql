CREATE TABLE "organization_slack_integration" (
	"organization_integration_id" uuid PRIMARY KEY,
	"team_id" text NOT NULL UNIQUE,
	"team_name" text NOT NULL,
	"app_id" text NOT NULL UNIQUE,
	"bot_user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"tag" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_integration_event" (
	"id" text PRIMARY KEY,
	"project_integration_link_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "project_slack_integration" (
	"project_integration_link_id" uuid PRIMARY KEY,
	"channel_id" text NOT NULL,
	"channel_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_notification" (
	"id" text PRIMARY KEY,
	"project_integration_link_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"actor_id" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "slack_oauth_state" (
	"state_hash" text PRIMARY KEY,
	"organization_integration_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"session_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_slack_integration" (
	"organization_integration_id" uuid,
	"user_id" text,
	"slack_user_id" text NOT NULL,
	"display_name" text NOT NULL,
	CONSTRAINT "user_slack_integration_pkey" PRIMARY KEY("organization_integration_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "project_integration_link" ADD COLUMN "subscribed_events" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "ticket_activity_outbox" ADD COLUMN "integration_events" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX "project_integration_event_pending_idx" ON "project_integration_event" ("project_integration_link_id") WHERE "consumed_at" is null;--> statement-breakpoint
CREATE INDEX "slack_notification_dispatch_idx" ON "slack_notification" ("dispatched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_slack_identity_uidx" ON "user_slack_integration" ("organization_integration_id","slack_user_id");--> statement-breakpoint
ALTER TABLE "organization_slack_integration" ADD CONSTRAINT "organization_slack_integration_SWzQzIJvdeJP_fkey" FOREIGN KEY ("organization_integration_id") REFERENCES "organization_integration"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_integration_event" ADD CONSTRAINT "project_integration_event_MHUq3LsV4kd7_fkey" FOREIGN KEY ("project_integration_link_id") REFERENCES "project_integration_link"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_slack_integration" ADD CONSTRAINT "project_slack_integration_S8X6OQjfDnDv_fkey" FOREIGN KEY ("project_integration_link_id") REFERENCES "project_integration_link"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "slack_notification" ADD CONSTRAINT "slack_notification_3hWhFqDQSCRg_fkey" FOREIGN KEY ("project_integration_link_id") REFERENCES "project_integration_link"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "slack_oauth_state" ADD CONSTRAINT "slack_oauth_state_HSwv7oDp8gfc_fkey" FOREIGN KEY ("organization_integration_id") REFERENCES "organization_slack_integration"("organization_integration_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "slack_oauth_state" ADD CONSTRAINT "slack_oauth_state_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_slack_integration" ADD CONSTRAINT "user_slack_integration_lj5xOUmtZ42r_fkey" FOREIGN KEY ("organization_integration_id") REFERENCES "organization_slack_integration"("organization_integration_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_slack_integration" ADD CONSTRAINT "user_slack_integration_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;