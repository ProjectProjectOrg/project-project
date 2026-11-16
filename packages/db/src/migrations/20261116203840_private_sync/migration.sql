CREATE TABLE "private_sync_change" (
	"user_id" text,
	"generation" integer,
	"sequence" bigint,
	"operation_id" text,
	"tickets" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_sync_change_pkey" PRIMARY KEY("user_id","generation","sequence")
);
--> statement-breakpoint
CREATE TABLE "private_sync_scope" (
	"user_id" text PRIMARY KEY,
	"generation" integer DEFAULT 1 NOT NULL,
	"head" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "private_sync_change_operation_idx" ON "private_sync_change" ("operation_id","user_id") WHERE "operation_id" is not null;--> statement-breakpoint
ALTER TABLE "private_sync_change" ADD CONSTRAINT "private_sync_change_user_id_private_sync_scope_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "private_sync_scope"("user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "private_sync_scope" ADD CONSTRAINT "private_sync_scope_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;