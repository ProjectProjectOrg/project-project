ALTER TABLE "comment_index" ADD COLUMN "origin" text;--> statement-breakpoint
ALTER TABLE "comment_index" ADD COLUMN "author_kind" text;--> statement-breakpoint
ALTER TABLE "comment_index" ADD COLUMN "jira_display_name" text;--> statement-breakpoint
ALTER TABLE "comment_index" ADD COLUMN "jira_account_id" text;--> statement-breakpoint
UPDATE "comment_index" SET "origin" = 'native', "author_kind" = 'user';--> statement-breakpoint
ALTER TABLE "comment_index" ALTER COLUMN "origin" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_index" ALTER COLUMN "author_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_index" ALTER COLUMN "author_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_index" ADD CONSTRAINT "comment_index_attribution_check" CHECK ((
        "author_kind" = 'user'
        and "author_id" is not null
        and "jira_display_name" is null
        and "jira_account_id" is null
      ) or (
        "author_kind" = 'jira'
        and "author_id" is null
        and "jira_display_name" is not null
        and "jira_account_id" is not null
      ));--> statement-breakpoint
ALTER TABLE "comment_index" ADD CONSTRAINT "comment_index_origin_check" CHECK ("origin" = 'jira' or ("origin" = 'native' and "author_kind" = 'user'));
