ALTER TABLE "invitation" ADD COLUMN "from_project" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "invitation" i SET "from_project" = true
WHERE i."status" = 'pending'
  AND EXISTS (SELECT 1 FROM "project_invite_grant" g WHERE g."invitation_id" = i."id");
