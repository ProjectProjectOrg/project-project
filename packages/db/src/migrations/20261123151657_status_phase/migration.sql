CREATE TYPE "status_phase" AS ENUM('unstarted', 'started', 'finished');--> statement-breakpoint
ALTER TABLE "project_status" ADD COLUMN "phase" "status_phase";--> statement-breakpoint
UPDATE "project_status" AS s SET "phase" = (CASE
  WHEN s."slug" = 'todo' THEN 'unstarted'
  WHEN s."slug" = 'in_progress' THEN 'started'
  WHEN s."slug" = 'done' THEN 'finished'
  WHEN s."order_key" collate "C" > (SELECT a."order_key" FROM "project_status" AS a WHERE a."project_id" = s."project_id" AND a."slug" = 'done') collate "C" THEN 'finished'
  WHEN s."order_key" collate "C" > (SELECT a."order_key" FROM "project_status" AS a WHERE a."project_id" = s."project_id" AND a."slug" = 'in_progress') collate "C" THEN 'started'
  ELSE 'unstarted'
END)::"status_phase";--> statement-breakpoint
ALTER TABLE "project_status" ALTER COLUMN "phase" SET NOT NULL;--> statement-breakpoint
DROP INDEX "project_status_order_idx";--> statement-breakpoint
CREATE INDEX "project_status_order_idx" ON "project_status" ("project_id","phase","order_key" collate "C");
