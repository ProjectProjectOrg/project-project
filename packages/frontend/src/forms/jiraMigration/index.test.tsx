import { useState } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as DateTime from "effect/DateTime"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import type {
  JiraMigrationDetail,
  JiraMigrationRequirements
} from "@projectproject/shared"
import { JiraMigrationForm } from "."

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }))

vi.mock("@effect/atom-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@effect/atom-react")>()
  return {
    ...actual,
    useAtomSet: () => mocks.mutate,
    useAtomValue: () => AsyncResult.initial()
  }
})

afterEach(() => {
  cleanup()
  mocks.mutate.mockReset()
})

const requirements: JiraMigrationRequirements = {
  destination: {
    suggestedName: "Platform",
    suggestedSlug:
      "platform" as JiraMigrationRequirements["destination"]["suggestedSlug"],
    suggestedKey:
      "WEB" as JiraMigrationRequirements["destination"]["suggestedKey"]
  },
  identities: [
    {
      jiraAccountId: "jira-user",
      displayName: "Ada",
      email: null,
      suggestedProjectProjectUserId: null
    }
  ],
  identityOptions: [],
  statuses: [
    {
      jiraStatusId: "jira-backlog",
      name: "Backlog",
      categoryKey: "new",
      suggestedProjectStatusSlug: null,
      createOption: null
    },
    {
      jiraStatusId: "jira-status",
      name: "Done elsewhere",
      categoryKey: "done",
      suggestedProjectStatusSlug: null,
      createOption: {
        slug: "done_elsewhere" as JiraMigrationRequirements["statusOptions"][number]["slug"],
        label:
          "Done elsewhere" as JiraMigrationRequirements["statusOptions"][number]["label"],
        icon: "CircleCheck",
        color:
          "#6B7280" as JiraMigrationRequirements["statusOptions"][number]["color"],
        isTerminal: false
      }
    }
  ],
  statusOptions: [
    {
      slug: "todo" as JiraMigrationRequirements["statusOptions"][number]["slug"],
      label:
        "Todo" as JiraMigrationRequirements["statusOptions"][number]["label"],
      icon: "CircleDashed",
      color:
        "#A3A3A3" as JiraMigrationRequirements["statusOptions"][number]["color"],
      isTerminal: false
    },
    {
      slug: "done" as JiraMigrationRequirements["statusOptions"][number]["slug"],
      label:
        "Done" as JiraMigrationRequirements["statusOptions"][number]["label"],
      icon: "CircleCheck",
      color:
        "#22C55E" as JiraMigrationRequirements["statusOptions"][number]["color"],
      isTerminal: true
    }
  ],
  issueTypes: [],
  priorities: [],
  tags: [],
  activeFutureSprintChoices: [],
  restrictedContent: { issueCount: 0, commentCount: 0, worklogCount: 0 },
  attachments: []
}

const now = DateTime.makeUnsafe("2026-09-15T10:00:00.000Z")
const detail: JiraMigrationDetail = {
  id: "migration",
  sourceCloudId: "cloud",
  sourceProjectId: "project",
  sourceProjectKey: "WEB",
  sourceProjectName: "Platform",
  status: "needs_configuration",
  phase: "configuration",
  revision: 14,
  progress: { phase: "configuration", done: 1, total: 1 },
  destinationProjectSlug: null,
  createdAt: now,
  updatedAt: now,
  scanSummary: {
    siteName: "Example Jira",
    siteUrl: "https://example.atlassian.net",
    projectName: "Platform",
    projectKey: "WEB",
    scannedAt: now,
    counts: {
      identities: 1,
      statuses: 1,
      issueTypes: 0,
      priorities: 0,
      tags: 0,
      issues: 1,
      comments: 0,
      attachments: 0,
      groups: 0,
      restrictions: 0
    },
    visibilityWarnings: []
  },
  requirements,
  configuration: null,
  actions: {
    canConfigure: true,
    canRun: false,
    canRescan: true,
    canCancel: false,
    canRetry: false,
    canDiscard: true
  },
  failure: null,
  reportPath: null,
  finishedAt: null
}

function FormNavigationHarness() {
  const [step, setStep] = useState<"people" | "statuses" | "types">("people")
  return (
    <JiraMigrationForm
      orgSlug="example"
      detail={detail}
      step={step}
      onStep={(nextStep) => {
        if (
          nextStep === "people" ||
          nextStep === "statuses" ||
          nextStep === "types"
        ) {
          setStep(nextStep)
        }
      }}
    />
  )
}

describe("JiraMigrationForm navigation", () => {
  it("validates forward and preserves unsaved choices across Back", async () => {
    render(<FormNavigationHarness />)

    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(await screen.findByRole("alert")).not.toBeNull()
    expect(screen.getByRole("heading", { name: "Link people" })).not.toBeNull()

    fireEvent.click(screen.getByRole("combobox", { name: "Ada" }))
    fireEvent.click(screen.getByRole("option", { name: "Don’t link" }))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(
      await screen.findByRole("heading", { name: "Map statuses" })
    ).not.toBeNull()

    fireEvent.click(screen.getByRole("combobox", { name: "Backlog" }))
    fireEvent.click(screen.getByRole("option", { name: "Todo" }))
    fireEvent.click(screen.getByRole("combobox", { name: "Done elsewhere" }))
    const createOption = screen.getByRole("option", {
      name: "Create status “Done elsewhere”"
    })
    expect(
      createOption.querySelector(".lucide-circle-question-mark")
    ).not.toBeNull()
    fireEvent.click(createOption)
    expect(screen.getByText(/creates a nonterminal status/)).not.toBeNull()
    expect(
      screen
        .getByRole("combobox", { name: "Done elsewhere" })
        .querySelector(".lucide-circle-question-mark")
    ).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    expect(
      await screen.findByRole("heading", { name: "Link people" })
    ).not.toBeNull()
    expect(screen.getByRole("combobox", { name: "Ada" }).textContent).toContain(
      "Don’t link"
    )

    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(
      await screen.findByRole("heading", { name: "Map statuses" })
    ).not.toBeNull()
    expect(
      screen.getByRole("combobox", { name: "Done elsewhere" }).textContent
    ).toContain("Create status “Done elsewhere”")
    expect(
      screen.getByRole("combobox", { name: "Backlog" }).textContent
    ).toContain("Todo")

    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(
      await screen.findByRole("heading", { name: "Map issue types" })
    ).not.toBeNull()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })
})
