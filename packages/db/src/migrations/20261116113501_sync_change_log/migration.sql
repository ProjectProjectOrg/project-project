CREATE TABLE "group_index" (
	"project_id" uuid,
	"group_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "group_index_pkey" PRIMARY KEY("project_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "group_member_index" (
	"project_id" uuid,
	"group_id" text,
	"ticket_id" text,
	"position" integer NOT NULL,
	CONSTRAINT "group_member_index_pkey" PRIMARY KEY("project_id","group_id","ticket_id")
);
--> statement-breakpoint
CREATE TABLE "sync_change" (
	"project_id" uuid,
	"generation" integer,
	"sequence" bigint,
	"operation_id" text,
	"origin" text,
	"changes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_change_pkey" PRIMARY KEY("project_id","generation","sequence")
);
--> statement-breakpoint
CREATE TABLE "sync_scope" (
	"project_id" uuid PRIMARY KEY,
	"generation" integer DEFAULT 1 NOT NULL,
	"head" bigint DEFAULT 0 NOT NULL,
	"oldest" bigint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "group_member_index_ticket_idx" ON "group_member_index" ("project_id","ticket_id");--> statement-breakpoint
ALTER TABLE "group_index" ADD CONSTRAINT "group_index_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "group_member_index" ADD CONSTRAINT "group_member_index_group_fkey" FOREIGN KEY ("project_id","group_id") REFERENCES "group_index"("project_id","group_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sync_change" ADD CONSTRAINT "sync_change_project_id_sync_scope_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "sync_scope"("project_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sync_scope" ADD CONSTRAINT "sync_scope_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;