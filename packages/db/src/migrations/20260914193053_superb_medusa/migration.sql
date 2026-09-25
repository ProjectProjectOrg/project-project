CREATE TABLE "user_jira_integration" (
	"user_id" text PRIMARY KEY,
	"encrypted_access_token" text NOT NULL,
	"access_token_nonce" text NOT NULL,
	"access_token_tag" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"refresh_token_nonce" text NOT NULL,
	"refresh_token_tag" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"granted_scopes" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reconnect_reason" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refresh_lease_id" uuid,
	"refresh_lease_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_jira_oauth_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"state_hash" text NOT NULL UNIQUE,
	"return_path" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "user_jira_integration_refresh_lease_idx" ON "user_jira_integration" ("refresh_lease_expires_at");--> statement-breakpoint
CREATE INDEX "user_jira_oauth_state_user_idx" ON "user_jira_oauth_state" ("user_id");--> statement-breakpoint
ALTER TABLE "user_jira_integration" ADD CONSTRAINT "user_jira_integration_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_jira_oauth_state" ADD CONSTRAINT "user_jira_oauth_state_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;