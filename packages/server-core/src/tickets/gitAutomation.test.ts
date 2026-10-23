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

const openLayer = {
  branch: "feat/T-1-ui",
  base: "feat/T-1",
  pr: 8,
  prState: "open" as const
}
const landedLayer = { ...openLayer, prState: "merged" as const, landed: true }

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
      name: "a merge that reached the default branch",
      before: ticket({ pr: 7, prState: "open" }),
      after: ticket({ pr: 7, prState: "merged", lastTransitionedPr: 7 }),
      expected: "pr_merged"
    },
    {
      name: "a merge into another branch",
      before: ticket({ pr: 7, prState: "open" }),
      after: ticket({ pr: 7, prState: "merged" }),
      expected: null
    },
    {
      name: "that merge landing later",
      before: ticket({ pr: 7, prState: "merged" }),
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
      before: ticket({ pr: 7, prState: "merged", lastTransitionedPr: 7 }),
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
    expect(gitAutomationEvent(before, after)).toBe(expected)
  })
})

describe("gitAutomationEvent with a stack", () => {
  const landedOwn = { pr: 7, prState: "merged" as const, lastTransitionedPr: 7 }

  it.each([
    {
      name: "the ticket's PR landing while a stacked one is open",
      before: ticket({ pr: 7, prState: "open", stack: [openLayer] }),
      after: ticket({ ...landedOwn, stack: [openLayer] }),
      expected: null
    },
    {
      name: "the last stacked PR landing",
      before: ticket({ ...landedOwn, stack: [openLayer] }),
      after: ticket({ ...landedOwn, stack: [landedLayer] }),
      expected: "pr_merged"
    },
    {
      name: "a stacked PR merged into a branch that hasn't landed",
      before: ticket({ ...landedOwn, stack: [openLayer] }),
      after: ticket({
        ...landedOwn,
        stack: [{ ...landedLayer, landed: false }]
      }),
      expected: null
    },
    {
      name: "a stacked PR opening on a ticket whose PR landed",
      before: ticket({ ...landedOwn }),
      after: ticket({ ...landedOwn, stack: [openLayer] }),
      expected: "pr_opened"
    },
    {
      name: "a first PR opening as a stacked draft",
      before: ticket({ branch: "feat/T-1" }),
      after: ticket({
        branch: "feat/T-1",
        stack: [{ ...openLayer, prDraft: true }]
      }),
      expected: "pr_draft_opened"
    },
    {
      name: "a stacked PR closed next to a landed one",
      before: ticket({ ...landedOwn, stack: [openLayer] }),
      after: ticket({
        ...landedOwn,
        stack: [{ ...openLayer, prState: "closed" }]
      }),
      expected: "pr_merged"
    }
  ])("$name → $expected", ({ before, after, expected }) => {
    expect(gitAutomationEvent(before, after)).toBe(expected)
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
