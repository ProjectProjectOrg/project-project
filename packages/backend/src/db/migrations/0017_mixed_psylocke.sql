CREATE TABLE "everhour_section_link" (
	"project_integration_link_id" uuid NOT NULL,
	"local_key" text NOT NULL,
	"group_id" text,
	"everhour_section_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	CONSTRAINT "everhour_section_link_project_integration_link_id_local_key_pk" PRIMARY KEY("project_integration_link_id","local_key")
);
--> statement-breakpoint
CREATE TABLE "everhour_task_link" (
	"project_integration_link_id" uuid NOT NULL,
	"ticket_id" text NOT NULL,
	"everhour_task_id" text NOT NULL,
	"status" text NOT NULL,
	"last_managed_labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_error" text,
	CONSTRAINT "everhour_task_link_project_integration_link_id_ticket_id_pk" PRIMARY KEY("project_integration_link_id","ticket_id")
);
--> statement-breakpoint
CREATE TABLE "project_everhour_integration" (
	"project_integration_link_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"status" text NOT NULL,
	"everhour_project_id" text NOT NULL,
	"everhour_project_name" text NOT NULL,
	"backlog_section_id" text,
	"last_synced_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_error" text,
	"last_sync_actor_user_id" text
);
--> statement-breakpoint
CREATE TABLE "user_everhour_integration" (
	"user_id" text PRIMARY KEY NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"api_key_nonce" text NOT NULL,
	"api_key_tag" text NOT NULL,
	"everhour_user_id" text NOT NULL,
	"name" text,
	"email" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_check_status" text,
	"last_check_error" text
);
--> statement-breakpoint
ALTER TABLE "everhour_section_link" ADD CONSTRAINT "everhour_section_link_project_link_fkey" FOREIGN KEY ("project_integration_link_id") REFERENCES "public"."project_integration_link"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "everhour_task_link" ADD CONSTRAINT "everhour_task_link_project_link_fkey" FOREIGN KEY ("project_integration_link_id") REFERENCES "public"."project_integration_link"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_everhour_integration" ADD CONSTRAINT "project_everhour_integration_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_everhour_integration" ADD CONSTRAINT "project_everhour_integration_link_id_organization_id_fkey" FOREIGN KEY ("project_integration_link_id","organization_id") REFERENCES "public"."project_integration_link"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_everhour_integration" ADD CONSTRAINT "user_everhour_integration_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_everhour_integration_active_project_uidx" ON "project_everhour_integration" USING btree ("organization_id","everhour_project_id") WHERE "project_everhour_integration"."status" = 'active';