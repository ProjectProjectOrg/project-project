CREATE TABLE "link_preview" (
	"url" text PRIMARY KEY,
	"title" text,
	"favicon_url" text,
	"fetched_at" timestamp with time zone NOT NULL
);
