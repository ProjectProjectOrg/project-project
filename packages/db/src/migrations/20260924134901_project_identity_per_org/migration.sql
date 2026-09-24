DO $$
DECLARE
  dangling_comments integer;
  dangling_attachment_references integer;
  dangling_figma_references integer;
  detached_attachments integer;
BEGIN
  DELETE FROM "comment_index" c
  WHERE NOT EXISTS (SELECT 1 FROM "project_index" p WHERE p."slug" = c."project_slug");
  GET DIAGNOSTICS dangling_comments = ROW_COUNT;

  DELETE FROM "attachment_reference" r
  WHERE NOT EXISTS (SELECT 1 FROM "project_index" p WHERE p."slug" = r."project_slug");
  GET DIAGNOSTICS dangling_attachment_references = ROW_COUNT;

  DELETE FROM "figma_reference" f
  WHERE NOT EXISTS (SELECT 1 FROM "project_index" p WHERE p."slug" = f."project_slug");
  GET DIAGNOSTICS dangling_figma_references = ROW_COUNT;

  SELECT count(*) INTO detached_attachments
  FROM "attachment_index" a
  WHERE NOT EXISTS (
    SELECT 1 FROM "project_index" p
    WHERE p."slug" = a."project_slug" AND p."organization_id" = a."organization_id"
  );

  RAISE LOG 'project_identity_per_org: deleted % comment, % attachment and % figma references to deleted projects, kept % attachments without a project',
    dangling_comments, dangling_attachment_references, dangling_figma_references, detached_attachments;
END $$;
--> statement-breakpoint
ALTER TABLE "attachment_index" ADD COLUMN "project_id" uuid;
--> statement-breakpoint
UPDATE "attachment_index" a SET "project_id" = p."id"
FROM "project_index" p
WHERE p."slug" = a."project_slug" AND p."organization_id" = a."organization_id";
--> statement-breakpoint
ALTER TABLE "attachment_reference" ADD COLUMN "project_id" uuid;
--> statement-breakpoint
UPDATE "attachment_reference" r SET "project_id" = p."id"
FROM "project_index" p
WHERE p."slug" = r."project_slug";
--> statement-breakpoint
ALTER TABLE "comment_index" ADD COLUMN "project_id" uuid;
--> statement-breakpoint
UPDATE "comment_index" c SET "project_id" = p."id"
FROM "project_index" p
WHERE p."slug" = c."project_slug";
--> statement-breakpoint
ALTER TABLE "comment_index" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "figma_link_index" ADD COLUMN "project_id" uuid;
--> statement-breakpoint
UPDATE "figma_link_index" f SET "project_id" = p."id"
FROM "project_index" p
WHERE p."slug" = f."project_slug";
--> statement-breakpoint
ALTER TABLE "figma_link_index" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "figma_reference" ADD COLUMN "project_id" uuid;
--> statement-breakpoint
UPDATE "figma_reference" f SET "project_id" = p."id"
FROM "project_index" p
WHERE p."slug" = f."project_slug";
--> statement-breakpoint
ALTER TABLE "project_image_reference" ADD COLUMN "project_id" uuid;
--> statement-breakpoint
UPDATE "project_image_reference" r SET "project_id" = p."id"
FROM "project_index" p
WHERE p."slug" = r."project_slug";
--> statement-breakpoint
ALTER TABLE "figma_link_index" DROP CONSTRAINT "figma_link_index_project_slug_project_index_slug_fkey";
--> statement-breakpoint
ALTER TABLE "project_image_reference" DROP CONSTRAINT "project_image_reference_project_slug_project_index_slug_fkey";
--> statement-breakpoint
ALTER TABLE "ticket_index" DROP CONSTRAINT "ticket_index_project_slug_project_id_fkey";
--> statement-breakpoint
DROP INDEX "project_index_slug_id_uidx";
--> statement-breakpoint
ALTER TABLE "project_index" DROP CONSTRAINT "project_index_pkey";
--> statement-breakpoint
ALTER TABLE "project_index" ADD CONSTRAINT "project_index_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
ALTER TABLE "project_status" DROP CONSTRAINT "project_status_project_id_project_index_id_fk";
--> statement-breakpoint
ALTER TABLE "project_tag" DROP CONSTRAINT "project_tag_project_id_project_index_id_fk";
--> statement-breakpoint
ALTER TABLE "project_invite_grant" DROP CONSTRAINT "project_invite_grant_project_id_project_index_id_fkey";
--> statement-breakpoint
ALTER TABLE "project_index" DROP CONSTRAINT "project_index_id_unique";
--> statement-breakpoint
ALTER TABLE "project_status" ADD CONSTRAINT "project_status_project_id_project_index_id_fk" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "project_tag" ADD CONSTRAINT "project_tag_project_id_project_index_id_fk" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "project_invite_grant" ADD CONSTRAINT "project_invite_grant_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX "project_index_organization_slug_uidx" ON "project_index" ("organization_id","slug");
--> statement-breakpoint
ALTER TABLE "attachment_reference" DROP CONSTRAINT "attachment_reference_attachment_id_project_slug_ticket_id_pk";
--> statement-breakpoint
ALTER TABLE "figma_reference" DROP CONSTRAINT "figma_reference_pkey";
--> statement-breakpoint
ALTER TABLE "project_image_reference" DROP CONSTRAINT "project_image_reference_pkey";
--> statement-breakpoint
ALTER TABLE "figma_link_index" DROP CONSTRAINT "figma_link_index_node_uidx";
--> statement-breakpoint
ALTER TABLE "attachment_index" DROP COLUMN "project_slug";
--> statement-breakpoint
ALTER TABLE "attachment_reference" DROP COLUMN "org_slug";
--> statement-breakpoint
ALTER TABLE "attachment_reference" DROP COLUMN "project_slug";
--> statement-breakpoint
ALTER TABLE "comment_index" DROP COLUMN "project_slug";
--> statement-breakpoint
ALTER TABLE "figma_link_index" DROP COLUMN "org_slug";
--> statement-breakpoint
ALTER TABLE "figma_link_index" DROP COLUMN "project_slug";
--> statement-breakpoint
ALTER TABLE "figma_reference" DROP COLUMN "org_slug";
--> statement-breakpoint
ALTER TABLE "figma_reference" DROP COLUMN "project_slug";
--> statement-breakpoint
ALTER TABLE "project_image_reference" DROP COLUMN "project_slug";
--> statement-breakpoint
ALTER TABLE "project_image_reference" DROP COLUMN "org_slug";
--> statement-breakpoint
ALTER TABLE "ticket_index" DROP COLUMN "org_slug";
--> statement-breakpoint
ALTER TABLE "ticket_index" DROP COLUMN "project_slug";
--> statement-breakpoint
ALTER TABLE "attachment_reference" ADD CONSTRAINT "attachment_reference_pkey" PRIMARY KEY ("attachment_id","project_id","ticket_id");
--> statement-breakpoint
ALTER TABLE "figma_reference" ADD CONSTRAINT "figma_reference_pkey" PRIMARY KEY ("link_id","project_id","ticket_id");
--> statement-breakpoint
ALTER TABLE "project_image_reference" ADD CONSTRAINT "project_image_reference_pkey" PRIMARY KEY ("project_id","slot");
--> statement-breakpoint
ALTER TABLE "figma_link_index" ADD CONSTRAINT "figma_link_index_node_uidx" UNIQUE NULLS NOT DISTINCT("project_id","file_key","node_id");
--> statement-breakpoint
CREATE INDEX "attachment_index_ticket_idx" ON "attachment_index" ("project_id","ticket_id");
--> statement-breakpoint
CREATE INDEX "attachment_reference_ticket_idx" ON "attachment_reference" ("project_id","ticket_id");
--> statement-breakpoint
CREATE INDEX "comment_index_ticket_idx" ON "comment_index" ("project_id","ticket_id","created_at");
--> statement-breakpoint
CREATE INDEX "comment_index_author_idx" ON "comment_index" ("author_id","project_id","ticket_id");
--> statement-breakpoint
CREATE INDEX "figma_link_index_file_idx" ON "figma_link_index" ("project_id","file_key");
--> statement-breakpoint
CREATE INDEX "figma_reference_ticket_idx" ON "figma_reference" ("project_id","ticket_id");
--> statement-breakpoint
ALTER TABLE "attachment_index" ADD CONSTRAINT "attachment_index_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "attachment_reference" ADD CONSTRAINT "attachment_reference_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "comment_index" ADD CONSTRAINT "comment_index_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "figma_link_index" ADD CONSTRAINT "figma_link_index_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "figma_reference" ADD CONSTRAINT "figma_reference_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "project_image_reference" ADD CONSTRAINT "project_image_reference_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;
