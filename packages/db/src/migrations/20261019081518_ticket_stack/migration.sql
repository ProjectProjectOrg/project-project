CREATE TABLE "ticket_branch" (
	"project_id" uuid,
	"ticket_id" text,
	"branch" text,
	"position" integer NOT NULL,
	"base" text,
	"pr" integer,
	"pr_state" text,
	"pr_draft" boolean DEFAULT false NOT NULL,
	"landed" boolean DEFAULT false NOT NULL,
	"branch_deleted_at" timestamp with time zone,
	"checks" text,
	"checks_head_sha" text,
	"checks_updated_at" timestamp with time zone,
	CONSTRAINT "ticket_branch_pkey" PRIMARY KEY("project_id","ticket_id","branch")
);
--> statement-breakpoint
ALTER TABLE "ticket_index" ADD COLUMN "pr_base" text;--> statement-breakpoint
ALTER TABLE "ticket_index" ADD COLUMN "ignored_branches" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "ticket_branch_branch_idx" ON "ticket_branch" ("project_id","branch");--> statement-breakpoint
CREATE INDEX "ticket_branch_base_idx" ON "ticket_branch" ("project_id","base");--> statement-breakpoint
ALTER TABLE "ticket_branch" ADD CONSTRAINT "ticket_branch_ticket_fkey" FOREIGN KEY ("project_id","ticket_id") REFERENCES "ticket_index"("project_id","ticket_id") ON DELETE CASCADE;