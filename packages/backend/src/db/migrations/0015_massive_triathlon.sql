CREATE TABLE "ticket_github_branch_index" (
	"project_integration_link_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"project_slug" text NOT NULL,
	"ticket_id" text NOT NULL,
	"branch" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_github_branch_index_project_integration_link_id_ticket_id_pk" PRIMARY KEY("project_integration_link_id","ticket_id")
);
--> statement-breakpoint
ALTER TABLE "ticket_github_branch_index" ADD CONSTRAINT "ticket_github_branch_index_link_id_organization_id_fkey" FOREIGN KEY ("project_integration_link_id","organization_id") REFERENCES "public"."project_integration_link"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_github_branch_index" ADD CONSTRAINT "ticket_github_branch_index_project_slug_project_id_fkey" FOREIGN KEY ("project_slug","project_id") REFERENCES "public"."project_index"("slug","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_github_branch_index_branch_idx" ON "ticket_github_branch_index" USING btree ("project_integration_link_id","branch");--> statement-breakpoint
CREATE INDEX "ticket_github_branch_index_project_idx" ON "ticket_github_branch_index" USING btree ("organization_id","project_id");