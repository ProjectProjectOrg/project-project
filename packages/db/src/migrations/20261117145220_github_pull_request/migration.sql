CREATE TABLE "github_pull_request" (
	"repository_id" text,
	"number" integer,
	"branch" text NOT NULL,
	"base" text NOT NULL,
	"state" text NOT NULL,
	"draft" boolean NOT NULL,
	"title" text NOT NULL,
	"merged_at" timestamp with time zone,
	"checks" text,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_pull_request_pkey" PRIMARY KEY("repository_id","number")
);
