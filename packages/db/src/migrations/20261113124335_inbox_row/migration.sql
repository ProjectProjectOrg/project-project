CREATE TABLE "inbox_row" (
	"project_id" uuid,
	"ticket_id" text,
	"user_id" text,
	"state" text NOT NULL,
	"direct" jsonb DEFAULT '[]' NOT NULL,
	"latest" jsonb NOT NULL,
	"latest_at" timestamp with time zone NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" text,
	"actor_client_id" text,
	"actor_client_name" text,
	"actor_source" text,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_read_at" timestamp with time zone,
	"read_by_client_name" text,
	CONSTRAINT "inbox_row_pkey" PRIMARY KEY("project_id","ticket_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "ticket_activity_outbox" ADD COLUMN "inbox" jsonb;--> statement-breakpoint
CREATE INDEX "inbox_row_user_idx" ON "inbox_row" ("user_id","state","latest_at");--> statement-breakpoint
ALTER TABLE "inbox_row" ADD CONSTRAINT "inbox_row_project_member_fkey" FOREIGN KEY ("project_id","user_id") REFERENCES "project_member"("project_id","user_id") ON DELETE CASCADE;