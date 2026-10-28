CREATE TABLE "feedback_attachment" (
	"id" text PRIMARY KEY,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"outbox_id" text,
	"object_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_outbox" (
	"id" text PRIMARY KEY,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "feedback_receipt" (
	"report_id" text PRIMARY KEY,
	"ticket_id" text,
	"verbatim" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "feedback_attachment_outbox_idx" ON "feedback_attachment" ("outbox_id");--> statement-breakpoint
CREATE INDEX "feedback_attachment_unclaimed_idx" ON "feedback_attachment" ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_outbox_dispatch_idx" ON "feedback_outbox" ("dispatched_at");--> statement-breakpoint
ALTER TABLE "feedback_attachment" ADD CONSTRAINT "feedback_attachment_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "feedback_attachment" ADD CONSTRAINT "feedback_attachment_outbox_id_feedback_outbox_id_fkey" FOREIGN KEY ("outbox_id") REFERENCES "feedback_outbox"("id") ON DELETE CASCADE;