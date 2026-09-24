DO $$
DECLARE
  folded integer;
  folded_invitations integer;
  duplicates integer;
BEGIN
  UPDATE "member"
  SET "role" = CASE
    WHEN 'owner' = ANY (string_to_array(replace("role", ' ', ''), ',')) THEN 'owner'
    WHEN 'admin' = ANY (string_to_array(replace("role", ' ', ''), ',')) THEN 'admin'
    ELSE 'member'
  END
  WHERE "role" NOT IN ('owner', 'admin', 'member');
  GET DIAGNOSTICS folded = ROW_COUNT;

  UPDATE "invitation"
  SET "role" = CASE
    WHEN 'owner' = ANY (string_to_array(replace("role", ' ', ''), ',')) THEN 'owner'
    WHEN 'admin' = ANY (string_to_array(replace("role", ' ', ''), ',')) THEN 'admin'
    ELSE 'member'
  END
  WHERE "role" IS NOT NULL AND "role" NOT IN ('owner', 'admin', 'member');
  GET DIAGNOSTICS folded_invitations = ROW_COUNT;

  WITH ranked AS (
    SELECT
      "id",
      row_number() OVER (
        PARTITION BY "organization_id", "user_id"
        ORDER BY
          CASE "role" WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
          "created_at",
          "id"
      ) AS position
    FROM "member"
  )
  DELETE FROM "member"
  WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1);
  GET DIAGNOSTICS duplicates = ROW_COUNT;

  RAISE LOG 'project_roles: folded % org roles and % invitation roles, removed % duplicate org memberships', folded, folded_invitations, duplicates;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "member_organization_user_uidx" ON "member" ("organization_id","user_id");
--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_role_check" CHECK ("role" in ('owner', 'admin', 'member', 'guest'));
--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_role_check" CHECK ("role" is null or "role" in ('owner', 'admin', 'member', 'guest'));
--> statement-breakpoint
CREATE TABLE "project_role" (
	"id" text PRIMARY KEY,
	"organization_id" text,
	"name" text NOT NULL,
	"permissions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_role_permissions_check" CHECK (("organization_id" is null) = ("permissions" is null))
);
--> statement-breakpoint
ALTER TABLE "project_role" ADD CONSTRAINT "project_role_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
INSERT INTO "project_role" ("id", "name") VALUES ('pm', 'PM'), ('developer', 'Developer'), ('client', 'Client');
--> statement-breakpoint
ALTER TABLE "project_member" RENAME TO "legacy_project_member";
--> statement-breakpoint
ALTER INDEX "project_member_user_idx" RENAME TO "legacy_project_member_user_idx";
--> statement-breakpoint
ALTER TABLE "legacy_project_member" DROP CONSTRAINT "project_member_project_slug_project_index_slug_fk";
--> statement-breakpoint
ALTER TABLE "legacy_project_member" DROP CONSTRAINT "project_member_project_id_project_index_id_fk";
--> statement-breakpoint
ALTER TABLE "legacy_project_member" DROP CONSTRAINT "project_member_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "project_invite_grant" RENAME TO "legacy_project_invite_grant";
--> statement-breakpoint
ALTER INDEX "project_invite_grant_project_idx" RENAME TO "legacy_project_invite_grant_project_idx";
--> statement-breakpoint
ALTER TABLE "legacy_project_invite_grant" DROP CONSTRAINT "project_invite_grant_invitation_id_invitation_id_fk";
--> statement-breakpoint
ALTER TABLE "legacy_project_invite_grant" DROP CONSTRAINT "project_invite_grant_project_slug_id_fkey";
--> statement-breakpoint
CREATE TABLE "project_member" (
	"project_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_member_pkey" PRIMARY KEY ("project_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX "project_member_user_idx" ON "project_member" ("user_id");
--> statement-breakpoint
CREATE INDEX "project_member_org_user_idx" ON "project_member" ("organization_id","user_id");
--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_role_id_project_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "project_role"("id");
--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_fkey" FOREIGN KEY ("project_id","organization_id") REFERENCES "project_index"("id","organization_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_org_member_fkey" FOREIGN KEY ("organization_id","user_id") REFERENCES "member"("organization_id","user_id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE TABLE "project_invite_grant" (
	"invitation_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"role_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_invite_grant_pkey" PRIMARY KEY ("invitation_id", "project_id")
);
--> statement-breakpoint
CREATE INDEX "project_invite_grant_project_idx" ON "project_invite_grant" ("project_id");
--> statement-breakpoint
ALTER TABLE "project_invite_grant" ADD CONSTRAINT "project_invite_grant_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "invitation"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "project_invite_grant" ADD CONSTRAINT "project_invite_grant_project_id_project_index_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project_index"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "project_invite_grant" ADD CONSTRAINT "project_invite_grant_role_id_project_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "project_role"("id");
--> statement-breakpoint
DO $$
DECLARE
  legacy_members integer;
  kept_members integer;
  implicit_members integer;
  legacy_grants integer;
  kept_grants integer;
BEGIN
  SELECT count(*) INTO legacy_members FROM "legacy_project_member";

  INSERT INTO "project_member" ("project_id", "organization_id", "user_id", "role_id", "created_at")
  SELECT
    p."id",
    p."organization_id",
    l."user_id",
    CASE
      WHEN l."role" IN ('owner', 'admin') OR m."role" IN ('owner', 'admin') THEN 'pm'
      ELSE 'developer'
    END,
    l."created_at"
  FROM "legacy_project_member" l
  JOIN "project_index" p ON p."slug" = l."project_slug"
  JOIN "member" m ON m."organization_id" = p."organization_id" AND m."user_id" = l."user_id";
  GET DIAGNOSTICS kept_members = ROW_COUNT;

  INSERT INTO "project_member" ("project_id", "organization_id", "user_id", "role_id")
  SELECT p."id", p."organization_id", m."user_id", 'pm'
  FROM "member" m
  JOIN "project_index" p ON p."organization_id" = m."organization_id"
  WHERE m."role" IN ('owner', 'admin')
  ON CONFLICT ("project_id", "user_id") DO NOTHING;
  GET DIAGNOSTICS implicit_members = ROW_COUNT;

  SELECT count(*) INTO legacy_grants FROM "legacy_project_invite_grant";

  INSERT INTO "project_invite_grant" ("invitation_id", "project_id", "role_id", "created_at")
  SELECT
    g."invitation_id",
    p."id",
    CASE g."role" WHEN 'admin' THEN 'pm' ELSE 'developer' END,
    g."created_at"
  FROM "legacy_project_invite_grant" g
  JOIN "project_index" p ON p."slug" = g."project_slug"
  JOIN "invitation" i ON i."id" = g."invitation_id" AND i."organization_id" = p."organization_id";
  GET DIAGNOSTICS kept_grants = ROW_COUNT;

  RAISE LOG 'project_roles: kept % of % project members, dropped % outside their org, added % pm rows for org owners and admins, kept % of % invite grants',
    kept_members, legacy_members, legacy_members - kept_members, implicit_members, kept_grants, legacy_grants;
END $$;
