ALTER TABLE "project_github_repository" DROP CONSTRAINT "project_github_repository_project_integration_link_id_project_integration_link_id_fk";
--> statement-breakpoint
ALTER TABLE "project_integration_link" DROP CONSTRAINT "project_integration_link_project_id_project_index_id_fk";
--> statement-breakpoint
ALTER TABLE "project_integration_link" DROP CONSTRAINT "project_integration_link_organization_integration_id_organization_integration_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "organization_integration_id_org_uidx" ON "organization_integration" USING btree ("id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_index_id_organization_uidx" ON "project_index" USING btree ("id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_integration_link_id_org_uidx" ON "project_integration_link" USING btree ("id","organization_id");--> statement-breakpoint
ALTER TABLE "project_github_repository" ADD CONSTRAINT "project_github_repository_link_id_organization_id_fkey" FOREIGN KEY ("project_integration_link_id","organization_id") REFERENCES "public"."project_integration_link"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_integration_link" ADD CONSTRAINT "project_integration_link_project_id_organization_id_fkey" FOREIGN KEY ("project_id","organization_id") REFERENCES "public"."project_index"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_integration_link" ADD CONSTRAINT "project_integration_link_org_integration_id_organization_id_fkey" FOREIGN KEY ("organization_integration_id","organization_id") REFERENCES "public"."organization_integration"("id","organization_id") ON DELETE no action ON UPDATE no action;
