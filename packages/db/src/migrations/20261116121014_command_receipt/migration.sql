CREATE TABLE "command_receipt" (
	"user_id" text,
	"operation_id" text,
	"request_hash" text NOT NULL,
	"outcome" jsonb,
	"receipt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "command_receipt_pkey" PRIMARY KEY("user_id","operation_id")
);
--> statement-breakpoint
CREATE INDEX "sync_change_operation_idx" ON "sync_change" ("operation_id") WHERE "operation_id" is not null;--> statement-breakpoint
ALTER TABLE "command_receipt" ADD CONSTRAINT "command_receipt_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;