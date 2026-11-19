CREATE TABLE "project_import_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"project_id" uuid NOT NULL,
	"ticket_id" text NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_import" ADD COLUMN "references_scanned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "project_import_destination_idx" ON "project_import" ("destination_project_id","updated_at") WHERE "status" = 'succeeded';--> statement-breakpoint
CREATE INDEX "project_import_reference_ticket_idx" ON "project_import_reference" ("project_id","ticket_id");--> statement-breakpoint
ALTER TABLE "project_import_reference" ADD CONSTRAINT "project_import_reference_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;