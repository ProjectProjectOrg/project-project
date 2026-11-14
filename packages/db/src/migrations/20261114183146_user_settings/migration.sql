CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY,
	"avatar_source" text,
	"editor_preference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_avatar_source_check" CHECK ("avatar_source" in ('generated', 'github', 'google')),
	CONSTRAINT "user_settings_editor_preference_check" CHECK ("editor_preference" in ('github', 'github_dev', 'vscode', 'cursor'))
);
--> statement-breakpoint
INSERT INTO "user_settings" ("user_id", "editor_preference")
SELECT "id", "editor_preference" FROM "user"
WHERE "editor_preference" IN ('github', 'github_dev', 'vscode', 'cursor');--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "editor_preference";--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;