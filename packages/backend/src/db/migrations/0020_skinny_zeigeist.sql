CREATE TABLE "everhour_work_type_task_link" (
	"project_integration_link_id" uuid NOT NULL,
	"group_id" text NOT NULL,
	"work_type_key" text NOT NULL,
	"everhour_task_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	CONSTRAINT "everhour_work_type_task_link_project_integration_link_id_group_id_work_type_key_pk" PRIMARY KEY("project_integration_link_id","group_id","work_type_key")
);
--> statement-breakpoint
ALTER TABLE "everhour_work_type_task_link" ADD CONSTRAINT "everhour_work_type_task_link_project_link_fkey" FOREIGN KEY ("project_integration_link_id") REFERENCES "public"."project_integration_link"("id") ON DELETE cascade ON UPDATE no action;