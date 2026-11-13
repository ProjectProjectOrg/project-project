CREATE TABLE "ticket_subscription" (
	"project_id" uuid,
	"ticket_id" text,
	"user_id" text,
	"subscribed" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_subscription_pkey" PRIMARY KEY("project_id","ticket_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "ticket_activity_outbox" ADD COLUMN "subscriptions" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX "ticket_subscription_user_idx" ON "ticket_subscription" ("user_id","project_id");--> statement-breakpoint
ALTER TABLE "ticket_subscription" ADD CONSTRAINT "ticket_subscription_project_member_fkey" FOREIGN KEY ("project_id","user_id") REFERENCES "project_member"("project_id","user_id") ON DELETE CASCADE;