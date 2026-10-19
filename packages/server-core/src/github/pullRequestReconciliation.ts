import type { Db } from "@pp/db"
import { githubPullRequestReconciliation } from "@pp/db/schema"
import { and, eq, isNull, lte, or, sql } from "drizzle-orm"
import * as Effect from "effect/Effect"

import type { GitHubPullRequestWebhookChange } from "./GitHubWebhooks"

export const rememberPullRequest = (
  db: Db["Service"],
  change: Pick<
    GitHubPullRequestWebhookChange,
    | "repositoryId"
    | "number"
    | "branch"
    | "baseBranch"
    | "state"
    | "updatedAt"
    | "mergedAt"
  >
) =>
  db
    .insert(githubPullRequestReconciliation)
    .values({
      repositoryId: change.repositoryId,
      number: change.number,
      branch: change.branch,
      base: change.baseBranch,
      state: change.state,
      updatedAt: change.updatedAt,
      mergedAt: change.mergedAt ?? null
    })
    .onConflictDoUpdate({
      target: [
        githubPullRequestReconciliation.repositoryId,
        githubPullRequestReconciliation.number
      ],
      set: {
        branch: change.branch,
        base: change.baseBranch,
        state: change.state,
        updatedAt: change.updatedAt,
        mergedAt: sql`coalesce(excluded.merged_at, ${githubPullRequestReconciliation.mergedAt})`
      },
      where: or(
        isNull(githubPullRequestReconciliation.updatedAt),
        change.updatedAt === null
          ? sql`false`
          : lte(githubPullRequestReconciliation.updatedAt, change.updatedAt)
      )
    })
    .returning({ number: githubPullRequestReconciliation.number })
    .pipe(
      Effect.map((rows) => rows.length > 0),
      Effect.orDie
    )

export const mergedPullRequestsForRepository = (
  db: Db["Service"],
  repositoryId: string
) =>
  db
    .select()
    .from(githubPullRequestReconciliation)
    .where(
      and(
        eq(githubPullRequestReconciliation.repositoryId, repositoryId),
        eq(githubPullRequestReconciliation.state, "merged")
      )
    )
    .pipe(Effect.orDie)
