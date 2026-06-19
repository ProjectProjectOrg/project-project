CREATE TABLE "everhour_active_timer" (
	"everhour_user_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_integration_link_id" uuid NOT NULL,
	"ticket_id" text,
	"group_id" text NOT NULL,
	"work_type_key" text NOT NULL,
	"everhour_task_id" text NOT NULL,
	"everhour_timer_id" text,
	"started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "everhour_time_attribution" (
	"everhour_time_id" text PRIMARY KEY NOT NULL,
	"project_integration_link_id" uuid NOT NULL,
	"ticket_id" text,
	"group_id" text NOT NULL,
	"work_type_key" text NOT NULL,
	"everhour_user_id" text NOT NULL,
	"user_id" text NOT NULL,
	"seconds" integer NOT NULL,
	"date" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_everhour_integration" ADD COLUMN "webhook_id" text;--> statement-breakpoint
ALTER TABLE "project_everhour_integration" ADD COLUMN "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "everhour_active_timer" ADD CONSTRAINT "everhour_active_timer_project_link_fkey" FOREIGN KEY ("project_integration_link_id") REFERENCES "public"."project_integration_link"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "everhour_time_attribution" ADD CONSTRAINT "everhour_time_attribution_project_link_fkey" FOREIGN KEY ("project_integration_link_id") REFERENCES "public"."project_integration_link"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "everhour_active_timer_user_idx" ON "everhour_active_timer" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "everhour_time_attribution_ticket_idx" ON "everhour_time_attribution" USING btree ("project_integration_link_id","ticket_id");