import { TicketId, TicketStatus } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import type { RawBranchEntry, RawProjectStates } from "../github/GitHub"
import {
  planAutomaticBranchLinks,
  planAutomaticStacks,
  planPullRequestWebhookTicket,
  planStackPullRequests,
  planTicketGitStates,
  type TicketGitStateInput
} from "./ticketGitStatePlanner"

const now = DateTime.toDate(DateTime.makeUnsafe("2026-05-08T10:00:00.000Z"))
const ticketId = Schema.decodeUnknownSync(TicketId)
const ticketStatus = Schema.decodeUnknownSync(TicketStatus)

const baseTicket = {
  id: ticketId("T-1"),
  status: ticketStatus("in_progress"),
  branch: null,
  pr: null,
  prState: null,
  prDraft: false,
  lastTransitionedPr: null
} satisfies TicketGitStateInput

function raw(overrides: Partial<RawProjectStates> = {}): RawProjectStates {
  return {
    defaultBranch: "main",
    existingBranches: new Set(),
    prByBranch: new Map(),
    ...overrides
  }
}

const pullRequest = (
  overrides: Partial<RawBranchEntry> = {}
): RawBranchEntry => ({
  headRefName: "feat/T-1",
  baseRefName: "main",
  state: "open",
  draft: false,
  number: 42,
  url: "https://github.test/pr/42",
  title: "Ship it",
  mergedAt: null,
  checks: "passing",
  ...overrides
})

const withPullRequest = (pr: RawBranchEntry) =>
  raw({
    existingBranches: new Set(["feat/T-1"]),
    prByBranch: new Map([["feat/T-1", pr]])
  })

describe("planTicketGitStates", () => {
  it("marks tickets without branches without writes", () => {
    const plan = planTicketGitStates([baseTicket], raw(), now)

    expect(plan.states).toEqual({
      "T-1": { tag: "no_branch", baseBranch: "main" }
    })
    expect(plan.writes).toEqual([])
  })

  it("marks missing remote branches as stale", () => {
    const plan = planTicketGitStates(
      [{ ...baseTicket, branch: "feat/T-1" }],
      raw(),
      now
    )

    expect(plan.states["T-1"]).toEqual({
      tag: "stale_branch",
      name: "feat/T-1"
    })
    expect(plan.writes).toEqual([])
  })

  it("records a merged PR with its base branch and leaves the status to automation", () => {
    const plan = planTicketGitStates(
      [{ ...baseTicket, branch: "feat/T-1" }],
      withPullRequest(pullRequest({ state: "merged", baseRefName: "release" })),
      now
    )

    expect(plan.states["T-1"]).toEqual({
      tag: "pr_merged",
      branch: "feat/T-1",
      baseBranch: "release",
      number: 42,
      url: "https://github.test/pr/42",
      title: "Ship it",
      mergedAt: now
    })
    expect(plan.writes).toEqual([
      {
        ticketId: "T-1",
        patch: {
          pr: 42,
          prState: "merged",
          prDraft: false,
          lastTransitionedPr: 42,
          prBase: "release"
        },
        pullRequestBase: "release"
      }
    ])
  })

  it("does not rewrite a merged PR it already recorded", () => {
    const plan = planTicketGitStates(
      [
        {
          ...baseTicket,
          status: ticketStatus("done"),
          branch: "feat/T-1",
          pr: 42,
          prState: "merged",
          prBase: "main",
          lastTransitionedPr: 42
        }
      ],
      withPullRequest(pullRequest({ state: "merged", mergedAt: now })),
      now
    )

    expect(plan.writes).toEqual([])
  })

  it("fills in or follows the base of a pull request it already recorded", () => {
    const recorded = {
      ...baseTicket,
      branch: "feat/T-1",
      pr: 42,
      prState: "open" as const
    }
    for (const prBase of [undefined, "feat/T-0"]) {
      const plan = planTicketGitStates(
        [{ ...recorded, prBase }],
        withPullRequest(pullRequest()),
        now
      )
      expect(plan.writes).toEqual([
        { ticketId: "T-1", patch: { prBase: "main" }, pullRequestBase: "main" }
      ])
    }
  })

  it("records a draft PR becoming ready for review", () => {
    const plan = planTicketGitStates(
      [
        {
          ...baseTicket,
          branch: "feat/T-1",
          pr: 42,
          prState: "open",
          prDraft: true
        }
      ],
      withPullRequest(pullRequest({ draft: false })),
      now
    )

    expect(plan.writes).toEqual([
      {
        ticketId: "T-1",
        patch: { pr: 42, prState: "open", prDraft: false, prBase: "main" },
        pullRequestBase: "main"
      }
    ])
  })
})

describe("planPullRequestWebhookTicket", () => {
  const webhookTicket = (
    input: Partial<TicketGitStateInput> = {}
  ): TicketGitStateInput => ({
    id: ticketId("T-84"),
    status: ticketStatus("in_progress"),
    branch: "feat/T-84-pr-webhook-lifecycle",
    pr: null,
    prState: null,
    prDraft: false,
    lastTransitionedPr: null,
    ...input
  })

  it("records open and draft pull requests", () => {
    expect(
      planPullRequestWebhookTicket(webhookTicket(), {
        number: 80,
        state: "open",
        draft: true
      })
    ).toEqual({ pr: 80, prState: "open", prDraft: true })
  })

  it("does not rewrite unchanged open pull request associations", () => {
    expect(
      planPullRequestWebhookTicket(webhookTicket({ pr: 80, prState: "open" }), {
        number: 80,
        state: "open",
        draft: false
      })
    ).toBeNull()
  })

  it("records closed pull requests", () => {
    expect(
      planPullRequestWebhookTicket(webhookTicket(), {
        number: 80,
        state: "closed",
        draft: false
      })
    ).toEqual({ pr: 80, prState: "closed", prDraft: false })
  })

  it("records a merge once", () => {
    expect(
      planPullRequestWebhookTicket(webhookTicket(), {
        number: 80,
        state: "merged",
        draft: false
      })
    ).toEqual({
      pr: 80,
      prState: "merged",
      prDraft: false,
      lastTransitionedPr: 80
    })
    expect(
      planPullRequestWebhookTicket(
        webhookTicket({
          status: ticketStatus("done"),
          pr: 80,
          prState: "merged",
          lastTransitionedPr: 80
        }),
        { number: 80, state: "merged", draft: false }
      )
    ).toBeNull()
  })

  it("ignores late non-merged events for a merged pull request", () => {
    const ticket = webhookTicket({
      status: ticketStatus("done"),
      pr: 80,
      prState: "merged",
      lastTransitionedPr: 80
    })

    expect(
      planPullRequestWebhookTicket(ticket, {
        number: 80,
        state: "open",
        draft: false
      })
    ).toBeNull()
    expect(
      planPullRequestWebhookTicket(ticket, {
        number: 80,
        state: "closed",
        draft: false
      })
    ).toBeNull()
  })
})

describe("planAutomaticBranchLinks", () => {
  const ticket = (
    id: string,
    branch: string | null = null,
    archivedAt?: Date | null
  ) => ({ id: ticketId(id), branch, archivedAt })

  it("links a unique exact ticket token to an unassigned ticket", () => {
    expect(
      planAutomaticBranchLinks(
        [ticket("PP-12"), ticket("PP-13")],
        new Set(["feat/PP-12-add-button", "bug/PP-13-fix"]),
        "main"
      )
    ).toEqual(
      new Map([
        [ticketId("PP-12"), "feat/PP-12-add-button"],
        [ticketId("PP-13"), "bug/PP-13-fix"]
      ])
    )
  })

  it("skips a branch the ticket ignores", () => {
    expect(
      planAutomaticBranchLinks(
        [
          { ...ticket("PP-12"), ignoredBranches: ["feat/PP-12-spike"] },
          ticket("PP-13")
        ],
        new Set(["feat/PP-12-spike", "bug/PP-13-fix"]),
        "main"
      )
    ).toEqual(new Map([[ticketId("PP-13"), "bug/PP-13-fix"]]))
  })

  it("requires canonical token boundaries and schema-valid ids", () => {
    expect(
      planAutomaticBranchLinks(
        [ticket("PP-12")],
        new Set([
          "feat/PP-12abc",
          "feat/XPP-12",
          "feat/PP-123",
          "feat/PP-12_invalid"
        ]),
        "main"
      )
    ).toEqual(new Map([[ticketId("PP-12"), "feat/PP-12_invalid"]]))
  })

  it("matches ticket ids case-insensitively", () => {
    expect(
      planAutomaticBranchLinks(
        [ticket("PP-18")],
        new Set(["feat/pp-18-test"]),
        "main"
      )
    ).toEqual(new Map([[ticketId("PP-18"), "feat/pp-18-test"]]))

    expect(
      planAutomaticBranchLinks(
        [ticket("OH-18")],
        new Set(["Oh-18/test"]),
        "main"
      )
    ).toEqual(new Map([[ticketId("OH-18"), "Oh-18/test"]]))
  })

  it("does not link a well-formed id that matches no eligible ticket", () => {
    expect(
      planAutomaticBranchLinks(
        [ticket("PP-18")],
        new Set([
          "revert-45-fix/dirty-dashboard-navigation",
          "issue-53-project-settings-setup-checklist",
          "chore/ticket-hover-cards"
        ]),
        "main"
      )
    ).toEqual(new Map())
  })

  it("does not confuse a longer key with a shorter one", () => {
    expect(
      planAutomaticBranchLinks(
        [ticket("OH-18")],
        new Set(["chore/ohio-18-fix"]),
        "main"
      )
    ).toEqual(new Map())
  })

  it("treats branches differing only by id case as ambiguous", () => {
    expect(
      planAutomaticBranchLinks(
        [ticket("PP-18")],
        new Set(["feat/PP-18-first", "feat/pp-18-second"]),
        "main"
      )
    ).toEqual(new Map())
  })

  it("ignores ids that aren't tickets but skips branches naming two tickets", () => {
    expect(
      planAutomaticBranchLinks(
        [ticket("PP-12"), ticket("PP-13")],
        new Set(["feat/PP-12-and-UNKNOWN-9", "feat/PP-12-PP-13"]),
        "main"
      )
    ).toEqual(new Map([[ticketId("PP-12"), "feat/PP-12-and-UNKNOWN-9"]]))
  })

  it("falls back to the open pull request's title, then its closing keywords", () => {
    expect(
      planAutomaticBranchLinks(
        [ticket("PP-12"), ticket("PP-13"), ticket("PP-14")],
        new Set(["fix-login", "cleanup", "refactor", "fix-utf-8"]),
        "main",
        new Map([
          ["fix-login", { title: "PP-12: fix login", body: "" }],
          ["cleanup", { title: "Cleanup", body: "Fixes PP-13" }],
          ["refactor", { title: "Refactor", body: "Related to PP-14" }]
        ])
      )
    ).toEqual(
      new Map([
        [ticketId("PP-12"), "fix-login"],
        [ticketId("PP-13"), "cleanup"]
      ])
    )
  })

  it("prefers the branch name over the pull request text", () => {
    expect(
      planAutomaticBranchLinks(
        [ticket("PP-12"), ticket("PP-13")],
        new Set(["feat/PP-12-login"]),
        "main",
        new Map([["feat/PP-12-login", { title: "PP-13: login", body: "" }]])
      )
    ).toEqual(new Map([[ticketId("PP-12"), "feat/PP-12-login"]]))
  })

  it("skips ambiguous tickets, existing links, archived tickets, and default branch", () => {
    expect(
      planAutomaticBranchLinks(
        [
          ticket("PP-12"),
          ticket("PP-13", "feat/PP-13-existing"),
          ticket("PP-14", null, now)
        ],
        new Set([
          "feat/PP-12-first",
          "feat/PP-12-second",
          "feat/PP-13-existing",
          "feat/PP-13-new",
          "main/PP-14"
        ]),
        "main/PP-14"
      )
    ).toEqual(new Map())
  })

  it("excludes a branch attached to another ticket from candidates", () => {
    expect(
      planAutomaticBranchLinks(
        [ticket("PP-12"), ticket("PP-13", "feat/PP-12-existing")],
        new Set(["feat/PP-12-existing", "feat/PP-12-new"]),
        "main"
      )
    ).toEqual(new Map([[ticketId("PP-12"), "feat/PP-12-new"]]))
  })
})

describe("stacked branches", () => {
  const pr = (branch: string, base: string, overrides = {}) =>
    [
      branch,
      pullRequest({ headRefName: branch, baseRefName: base, ...overrides })
    ] as const

  it("links the bottom of a chain of branches named for one ticket", () => {
    const prs = new Map([
      pr("feat/T-1-ui", "feat/T-1-api"),
      pr("feat/T-1-api", "main")
    ])
    const branches = new Set(["feat/T-1-api", "feat/T-1-ui"])
    const tickets = [{ ...baseTicket }]

    const own = planAutomaticBranchLinks(
      tickets,
      branches,
      "main",
      new Map(),
      prs
    )

    expect(own).toEqual(new Map([[ticketId("T-1"), "feat/T-1-api"]]))
    expect(
      planAutomaticStacks(tickets, own, branches, "main", new Map(), prs)
    ).toEqual(
      new Map([
        [
          ticketId("T-1"),
          [
            {
              branch: "feat/T-1-ui",
              base: "feat/T-1-api",
              pr: 42,
              prState: "open"
            }
          ]
        ]
      ])
    )
  })

  it("leaves branches named for one ticket alone when they don't form a chain", () => {
    expect(
      planAutomaticBranchLinks(
        [{ ...baseTicket }],
        new Set(["feat/T-1-api", "feat/T-1-ui"]),
        "main",
        new Map(),
        new Map([pr("feat/T-1-api", "main"), pr("feat/T-1-ui", "main")])
      )
    ).toEqual(new Map())
  })

  it("stacks branches on a ticket that already has one", () => {
    const linked = {
      ...baseTicket,
      branch: "feat/T-1",
      stack: [{ branch: "api", base: "feat/T-1" }],
      ignoredBranches: ["feat/T-1-spike"]
    }
    const stacks = planAutomaticStacks(
      [linked],
      new Map(),
      new Set([
        "polish",
        "ui",
        "feat/T-1-docs",
        "feat/T-1-spike",
        "feat/T-1-old",
        "unrelated"
      ]),
      "main",
      new Map([
        ["ui", { title: "T-1: checkout UI", body: "" }],
        ["polish", { title: "Polish", body: "Fixes T-1" }]
      ]),
      new Map([
        pr("polish", "ui"),
        pr("ui", "api"),
        pr("feat/T-1-spike", "feat/T-1"),
        pr("feat/T-1-old", "feat/T-1", { state: "closed" }),
        pr("unrelated", "feat/T-1")
      ])
    )

    expect(
      stacks.get(ticketId("T-1"))?.map((layer) => [layer.branch, layer.base])
    ).toEqual([
      ["feat/T-1-docs", undefined],
      ["ui", "api"],
      ["polish", "ui"]
    ])
  })

  it("brings stacked branches up to their pull requests", () => {
    expect(
      planStackPullRequests(
        [
          { branch: "ui", base: "api", pr: 42, prState: "open" },
          { branch: "docs" }
        ],
        new Map([
          pr("ui", "feat/T-1", { state: "merged" }),
          pr("docs", "ui", { draft: true, number: 43 })
        ])
      )
    ).toEqual([
      { branch: "ui", base: "feat/T-1", pr: 42, prState: "merged" },
      { branch: "docs", base: "ui", pr: 43, prState: "open", prDraft: true }
    ])
  })
})
