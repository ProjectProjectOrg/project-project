CREATE TABLE "ticket_activity" (
	"id" uuid PRIMARY KEY,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "ticket_activity_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" uuid NOT NULL,
	"ticket_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" text,
	"actor_client_id" text,
	"actor_client_name" text,
	"actor_source" text,
	"cause" text,
	"change" jsonb NOT NULL,
	CONSTRAINT "ticket_activity_actor_check" CHECK ((
        "actor_kind" = 'user'
        and "actor_user_id" is not null
        and "actor_client_id" is null
        and "actor_client_name" is null
        and "actor_source" is null
      ) or (
        "actor_kind" = 'agent'
        and "actor_user_id" is not null
        and "actor_client_id" is not null
        and "actor_client_name" is not null
        and "actor_source" is null
      ) or (
        "actor_kind" = 'system'
        and "actor_user_id" is null
        and "actor_client_id" is null
        and "actor_client_name" is null
        and "actor_source" is not null
      ))
);
--> statement-breakpoint
CREATE TABLE "ticket_activity_outbox" (
	"batch_id" uuid PRIMARY KEY,
	"project_id" uuid NOT NULL,
	"document_kind" text NOT NULL,
	"document_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"rows" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ticket_activity_ticket_idx" ON "ticket_activity" ("project_id","ticket_id","occurred_at","seq");--> statement-breakpoint
ALTER TABLE "ticket_activity" ADD CONSTRAINT "ticket_activity_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ticket_activity" ADD CONSTRAINT "ticket_activity_actor_user_id_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "ticket_activity_outbox" ADD CONSTRAINT "ticket_activity_outbox_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;