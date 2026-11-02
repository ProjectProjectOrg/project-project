CREATE TABLE "webhook_delivery" (
	"id" text PRIMARY KEY,
	"endpoint_id" uuid NOT NULL,
	"event" text NOT NULL,
	"body" text NOT NULL,
	"kind" text NOT NULL,
	"state" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_status_code" integer,
	"last_outcome" text,
	"response_excerpt" text,
	"created_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"organization_id" text NOT NULL,
	"project_integration_link_id" uuid,
	"url_display" text NOT NULL,
	"url_ciphertext" text NOT NULL,
	"url_nonce" text NOT NULL,
	"url_tag" text NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_nonce" text NOT NULL,
	"secret_tag" text NOT NULL,
	"secret_fingerprint" text NOT NULL,
	"header_names" jsonb DEFAULT '[]' NOT NULL,
	"headers_ciphertext" text,
	"headers_nonce" text,
	"headers_tag" text,
	"status" text NOT NULL,
	"disabled_reason" text,
	"disabled_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"failing_since" timestamp with time zone,
	"gone_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "project_integration_link_active_provider_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "project_integration_link_active_provider_uidx" ON "project_integration_link" ("project_id","provider") WHERE "status" = 'active' and "provider" <> 'webhook';--> statement-breakpoint
CREATE INDEX "webhook_delivery_endpoint_idx" ON "webhook_delivery" ("endpoint_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_delivery_pending_idx" ON "webhook_delivery" ("endpoint_id","created_at","id") WHERE "state" = 'pending';--> statement-breakpoint
CREATE INDEX "webhook_delivery_expiry_idx" ON "webhook_delivery" ("created_at") WHERE "state" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_endpoint_link_uidx" ON "webhook_endpoint" ("project_integration_link_id");--> statement-breakpoint
CREATE INDEX "webhook_endpoint_org_idx" ON "webhook_endpoint" ("organization_id");--> statement-breakpoint
CREATE INDEX "webhook_endpoint_due_idx" ON "webhook_endpoint" ("next_attempt_at","id") WHERE "status" = 'active';--> statement-breakpoint
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_endpoint_id_webhook_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "webhook_endpoint"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "webhook_endpoint" ADD CONSTRAINT "webhook_endpoint_link_org_fkey" FOREIGN KEY ("project_integration_link_id","organization_id") REFERENCES "project_integration_link"("id","organization_id") ON DELETE CASCADE;