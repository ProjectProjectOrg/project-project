CREATE TABLE "project_ticket_counter" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"next_number" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "project_ticket_counter" ADD CONSTRAINT "project_ticket_counter_project_id_project_index_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project_index"("id") ON DELETE cascade ON UPDATE no action;
