CREATE TABLE "sidebar_pin" (
	"user_id" text,
	"organization_id" text NOT NULL,
	"project_id" uuid,
	"kind" text,
	"ref" text,
	"order_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sidebar_pin_pkey" PRIMARY KEY("user_id","project_id","kind","ref")
);
--> statement-breakpoint
CREATE INDEX "sidebar_pin_user_org_idx" ON "sidebar_pin" ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "sidebar_pin_target_idx" ON "sidebar_pin" ("project_id","kind","ref");--> statement-breakpoint
ALTER TABLE "sidebar_pin" ADD CONSTRAINT "sidebar_pin_project_fkey" FOREIGN KEY ("project_id","organization_id") REFERENCES "project_index"("id","organization_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sidebar_pin" ADD CONSTRAINT "sidebar_pin_org_member_fkey" FOREIGN KEY ("organization_id","user_id") REFERENCES "member"("organization_id","user_id") ON DELETE CASCADE;