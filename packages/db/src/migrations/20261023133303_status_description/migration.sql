ALTER TABLE "project_status" ADD COLUMN "description" text;--> statement-breakpoint
UPDATE "project_status" SET "description" = 'Ready to be picked up: the work is defined and nobody has started it yet.' WHERE "slug" = 'todo' AND "description" IS NULL;--> statement-breakpoint
UPDATE "project_status" SET "description" = 'Someone is actively working on it.' WHERE "slug" = 'in_progress' AND "description" IS NULL;--> statement-breakpoint
UPDATE "project_status" SET "description" = 'Finished: the work is merged or otherwise complete.' WHERE "slug" = 'done' AND "description" IS NULL;
