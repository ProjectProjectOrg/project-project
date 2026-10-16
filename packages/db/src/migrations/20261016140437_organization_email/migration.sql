CREATE TABLE "organization_email" (
	"organization_id" text PRIMARY KEY,
	"revision" uuid DEFAULT gen_random_uuid() NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"security" text NOT NULL,
	"username" text NOT NULL,
	"sender_name" text NOT NULL,
	"sender_email" text NOT NULL,
	"reply_to" text,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"tag" text NOT NULL,
	"last_test_at" timestamp with time zone,
	"last_test_error" text
);
--> statement-breakpoint
ALTER TABLE "organization_email" ADD CONSTRAINT "organization_email_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;