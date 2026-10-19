import { StatusSlug } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { DEFAULT_GIT_AUTOMATION_CONFIG } from "../projects/gitAutomationTesting"
import {
  gitAutomationEvent,
  planGitAutomation,
  type GitAutomationConfig,
  type TicketGitFields
} from "./gitAutomation"

const status = Schema.decodeSync(StatusSlug)

const ticket = (overrides: Partial<TicketGitFields> = {}): TicketGitFields => ({
  status: status("todo"),
  branch: null,
  pr: null,
  prState: null,
  prDraft: false,
  lastTransitionedPr: null,
  ...overrides
})

const onMain = { defaultBranch: "main", pullRequestBase: "main" }

describe("gitAutomationEvent", () => {
  it.each([
    {
      name: "a newly linked branch",
      before: ticket(),
      after: ticket({ branch: "feat/T-1" }),
      expected: "branch_linked"
    },
    {
      name: "a draft PR",
      before: ticket({ branch: "feat/T-1" }),
      after: ticket({
        branch: "feat/T-1",
        pr: 7,
        prState: "open",
        prDraft: true
      }),
      expected: "pr_draft_opened"
    },
    {
      name: "a draft marked ready for review",
      before: ticket({ pr: 7, prState: "open", prDraft: true }),
      after: ticket({ pr: 7, prState: "open", prDraft: false }),
      expected: "pr_opened"
    },
    {
      name: "a branch linked together with its open PR",
      before: ticket(),
      after: ticket({ branch: "feat/T-1", pr: 7, prState: "open" }),
      expected: "pr_opened"
    },
    {
      name: "a reopened PR",
      before: ticket({ pr: 7, prState: "closed" }),
      after: ticket({ pr: 7, prState: "open" }),
      expected: "pr_opened"
    },
    {
      name: "a merge into the default branch",
      before: ticket({ pr: 7, prState: "open" }),
      after: ticket({ pr: 7, prState: "merged", lastTransitionedPr: 7 }),
      expected: "pr_merged"
    },
    {
      name: "a PR closed without merging",
      before: ticket({ pr: 7, prState: "open" }),
      after: ticket({ pr: 7, prState: "closed" }),
      expected: "pr_closed"
    },
    {
      name: "the same state seen again",
      before: ticket({ branch: "feat/T-1", pr: 7, prState: "open" }),
      after: ticket({ branch: "feat/T-1", pr: 7, prState: "open" }),
      expected: null
    },
    {
      name: "a merge already handled for this PR",
      before: ticket({ pr: 7, prState: "open", lastTransitionedPr: 7 }),
      after: ticket({ pr: 7, prState: "merged", lastTransitionedPr: 7 }),
      expected: null
    },
    {
      name: "an unlinked branch",
      before: ticket({ branch: "feat/T-1" }),
      after: ticket(),
      expected: null
    }
  ])("$name → $expected", ({ before, after, expected }) => {
    expect(gitAutomationEvent(before, after, onMain)).toBe(expected)
  })

  it("ignores a merge into a branch other than the default", () => {
    expect(
      gitAutomationEvent(
        ticket({ pr: 7, prState: "open" }),
        ticket({ pr: 7, prState: "merged", lastTransitionedPr: 7 }),
        { defaultBranch: "main", pullRequestBase: "feat/stack-base" }
      )
    ).toBeNull()
  })
})

describe("planGitAutomation", () => {
  const config: GitAutomationConfig = {
    rules: {
      ...DEFAULT_GIT_AUTOMATION_CONFIG.rules,
      branch_linked: status("in_progress"),
      pr_opened: status("in_review")
    },
    forwardOnly: true,
    statusOrder: ["todo", "in_progress", "in_review", "done"]
  }

  it("moves the ticket to the event's status", () => {
    expect(planGitAutomation(status("todo"), "pr_opened", config)).toBe(
      "in_review"
    )
  })

  it("does nothing for an event without a rule", () => {
    expect(planGitAutomation(status("todo"), "pr_closed", config)).toBeNull()
  })

  it("does nothing when the ticket is already there", () => {
    expect(
      planGitAutomation(status("in_review"), "pr_opened", config)
    ).toBeNull()
  })

  it("skips a move backwards only while forward-only is on", () => {
    expect(planGitAutomation(status("done"), "pr_opened", config)).toBeNull()
    expect(
      planGitAutomation(status("done"), "pr_opened", {
        ...config,
        forwardOnly: false
      })
    ).toBe("in_review")
  })

  it("moves a ticket whose status is missing from the order", () => {
    expect(planGitAutomation(status("legacy"), "pr_opened", config)).toBe(
      "in_review"
    )
  })
})
