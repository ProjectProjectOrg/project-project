CREATE TABLE "ticket_relation_index" (
	"project_id" uuid,
	"from_ticket_id" text,
	"to_ticket_id" text,
	"kind" text,
	CONSTRAINT "ticket_relation_index_pkey" PRIMARY KEY("project_id","from_ticket_id","to_ticket_id","kind")
);
--> statement-breakpoint
CREATE INDEX "ticket_relation_index_to_idx" ON "ticket_relation_index" ("project_id","to_ticket_id");--> statement-breakpoint
ALTER TABLE "ticket_relation_index" ADD CONSTRAINT "ticket_relation_index_from_ticket_fkey" FOREIGN KEY ("project_id","from_ticket_id") REFERENCES "ticket_index"("project_id","ticket_id") ON DELETE CASCADE;