import * as DateTime from "effect/DateTime"
import { expect, it } from "vitest"

import type { GitHubPullRequestWebhookChange } from "./GitHubWebhooks"
import { reconcilePullRequestChange } from "./pullRequestReconciliation"

const change: GitHubPullRequestWebhookChange = {
  installationId: "installation",
  repositoryId: "repository",
  branch: "feature",
  number: 12,
  title: "Feature",
  body: "",
  state: "merged",
  draft: false,
  updatedAt: DateTime.toDateUtc(DateTime.makeUnsafe("2026-10-19T09:00:00Z")),
  mergedAt: DateTime.toDateUtc(DateTime.makeUnsafe("2026-10-19T09:00:00Z")),
  baseBranch: "release",
  defaultBranch: "main"
}

it.each([
  ["2026-10-19T10:00:00Z", true],
  ["2026-10-19T09:00:00Z", false],
  ["2026-10-19T08:00:00Z", false],
  [null, false]
] as const)(
  "reconciles a late child delivery against a base merged at %s",
  (mergedAt, landed) => {
    const result = reconcilePullRequestChange(change, "develop", [
      {
        branch: "release",
        base: "develop",
        mergedAt:
          mergedAt === null
            ? null
            : DateTime.toDateUtc(DateTime.makeUnsafe(mergedAt))
      }
    ])
    expect(result.landed).toBe(landed)
    expect(result.defaultBranch).toBe("develop")
  }
)
