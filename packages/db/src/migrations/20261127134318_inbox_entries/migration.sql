CREATE TABLE "inbox_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"project_id" uuid NOT NULL,
	"ticket_id" text NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"state" text NOT NULL,
	"cleared_by" text,
	"resolved_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"read_revision" integer DEFAULT 0 NOT NULL,
	"event_count" integer DEFAULT 1 NOT NULL,
	"latest" jsonb NOT NULL,
	"latest_at" timestamp with time zone NOT NULL,
	"comment_id" text,
	"actor_kind" text NOT NULL,
	"actor_user_id" text,
	"actor_client_id" text,
	"actor_client_name" text,
	"actor_source" text,
	"read_by_client_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_entry_key_uidx" UNIQUE("project_id","ticket_id","user_id","key")
);
--> statement-breakpoint
DROP TABLE "inbox_row";--> statement-breakpoint
CREATE INDEX "inbox_entry_user_idx" ON "inbox_entry" ("user_id","state","latest_at");--> statement-breakpoint
ALTER TABLE "inbox_entry" ADD CONSTRAINT "inbox_entry_project_member_fkey" FOREIGN KEY ("project_id","user_id") REFERENCES "project_member"("project_id","user_id") ON DELETE CASCADE;