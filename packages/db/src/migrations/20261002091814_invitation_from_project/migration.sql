ALTER TABLE "invitation" ADD COLUMN "from_project" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "invitation" i SET "from_project" = true
WHERE i."status" = 'pending'
  AND i."expires_at" > now()
  AND i."role" IN ('member', 'guest')
  AND EXISTS (SELECT 1 FROM "project_invite_grant" g WHERE g."invitation_id" = i."id")
  AND (
    NOT EXISTS (
      SELECT 1 FROM "member" m
      WHERE m."organization_id" = i."organization_id"
        AND m."user_id" = i."inviter_id"
        AND m."role" IN ('owner', 'admin')
    )
    OR (SELECT min(g."created_at") FROM "project_invite_grant" g WHERE g."invitation_id" = i."id")
      <= (i."created_at" AT TIME ZONE 'UTC') + interval '1 minute'
  );
