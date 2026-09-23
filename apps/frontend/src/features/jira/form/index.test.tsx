import type { JiraMigrationDetail, JiraMigrationRequirements } from "@pp/shared"
import { Conflict } from "@pp/shared"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import * as DateTime from "effect/DateTime"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type * as Atom from "effect/unstable/reactivity/Atom"
import { createRef, useRef, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  configureJiraMigrationAtom,
  jiraDestinationConflictsAtom,
  jiraMigrationKey
} from "@/features/jira/atoms/jiraMigration"

import { JiraMigrationForm, type JiraDraftSave } from "."

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  failedConfigure: false,
  observedAtoms: [] as Array<unknown>
}))

vi.mock("@effect/atom-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@effect/atom-react")>()
  return {
    ...actual,
    useAtomSet: () => mocks.mutate,
    useAtomValue: (atom: Atom.Atom<unknown>) => {
      mocks.observedAtoms.push(atom)
      if (
        mocks.failedConfigure &&
        atom ===
          configureJiraMigrationAtom(jiraMigrationKey("example", "migration"))
      )
        return AsyncResult.fail(new Error("Configuration failed"))
      return AsyncResult.success([])
    },
    useAtomRefresh: () => vi.fn()
  }
})

afterEach(() => {
  cleanup()
  mocks.mutate.mockReset()
  mocks.failedConfigure = false
  mocks.observedAtoms.length = 0
})

beforeEach(() => {
  mocks.mutate.mockImplementation(async (input: { expectedRevision: number }) =>
    Exit.succeed({ ...detail, revision: input.expectedRevision + 1 })
  )
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
  failedAttachmentIds: [],
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

function FormNavigationHarness({
  initialDetail = detail
}: Readonly<{ initialDetail?: JiraMigrationDetail }>) {
  const [step, setStep] = useState<"people" | "statuses" | "types">("people")
  const draftSaveRef = useRef<JiraDraftSave | null>(null)
  return (
    <JiraMigrationForm
      orgSlug="example"
      detail={initialDetail}
      step={step}
      draftSaveRef={draftSaveRef}
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
  it("returns from failed-file correction without saving an unchanged draft", () => {
    const onExitCorrection = vi.fn()
    const draftSaveRef = createRef<JiraDraftSave | null>()
    render(
      <JiraMigrationForm
        orgSlug="example"
        detail={{
          ...detail,
          status: "failed",
          destinationProjectSlug: requirements.destination.suggestedSlug,
          failedAttachmentIds: ["attachment-1"],
          requirements: {
            ...requirements,
            attachments: [
              {
                jiraAttachmentId: "attachment-1",
                filename: "notes.txt",
                byteSize: 12,
                forcedSkipReason: null
              }
            ]
          }
        }}
        step="review"
        draftSaveRef={draftSaveRef}
        onStep={() => {}}
        onExitCorrection={onExitCorrection}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    expect(onExitCorrection).toHaveBeenCalledOnce()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it("keeps the current step and shows a mapped error when saving fails", async () => {
    mocks.failedConfigure = true
    mocks.mutate.mockResolvedValueOnce(
      Exit.fail(new Conflict({ reason: "jira_migration_revision_conflict" }))
    )
    render(<FormNavigationHarness />)

    fireEvent.click(screen.getByRole("combobox", { name: "Ada" }))
    fireEvent.click(screen.getByRole("option", { name: "Don’t link" }))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))

    expect(
      await screen.findByText(
        "This draft changed elsewhere. Reload it before saving again."
      )
    ).not.toBeNull()
    expect(screen.getByRole("heading", { name: "Link people" })).not.toBeNull()
    expect(mocks.mutate).toHaveBeenCalledTimes(1)
  })

  it("hydrates a saved partial configuration after remount", async () => {
    const { unmount } = render(<FormNavigationHarness />)
    fireEvent.click(screen.getByRole("combobox", { name: "Ada" }))
    fireEvent.click(screen.getByRole("option", { name: "Don’t link" }))
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    await screen.findByRole("heading", { name: "Map statuses" })
    const saved = mocks.mutate.mock.calls[0]?.[0].configuration
    expect(saved.restrictedContent).toEqual({ policy: "exclude" })
    unmount()

    render(
      <FormNavigationHarness
        initialDetail={{ ...detail, revision: 15, configuration: saved }}
      />
    )
    expect(screen.getByRole("combobox", { name: "Ada" }).textContent).toContain(
      "Don’t link"
    )
  })

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
    expect(mocks.mutate).toHaveBeenCalledTimes(4)
    expect(mocks.mutate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        expectedRevision: 14,
        configuration: expect.objectContaining({
          identities: [
            { jiraAccountId: "jira-user", projectProjectUserId: null }
          ],
          statuses: [],
          restrictedContent: { policy: "exclude" }
        })
      })
    )
    expect(mocks.mutate).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ expectedRevision: 17 })
    )
  })
})

describe("JiraMigrationForm restricted content", () => {
  const renderReview = (
    restrictedContent: JiraMigrationRequirements["restrictedContent"]
  ) => {
    const reviewRequirements = {
      ...requirements,
      identities: [],
      statuses: [],
      restrictedContent
    }
    const reviewDetail = {
      ...detail,
      requirements: reviewRequirements,
      scanSummary: {
        ...detail.scanSummary!,
        counts: {
          ...detail.scanSummary!.counts,
          restrictions:
            restrictedContent.issueCount +
            restrictedContent.commentCount +
            restrictedContent.worklogCount
        }
      }
    }
    mocks.mutate.mockImplementation(
      async (input: { expectedRevision: number }) =>
        Exit.succeed({ ...reviewDetail, revision: input.expectedRevision + 1 })
    )

    render(
      <JiraMigrationForm
        orgSlug="example"
        detail={reviewDetail}
        step="review"
        draftSaveRef={createRef<JiraDraftSave | null>()}
        onStep={() => {}}
      />
    )
  }

  it("requires an explicit restricted-content choice before migration", async () => {
    renderReview({ issueCount: 1, commentCount: 0, worklogCount: 0 })

    fireEvent.click(screen.getByRole("button", { name: "Confirm and migrate" }))

    expect(await screen.findByRole("alert")).not.toBeNull()
    expect(mocks.mutate).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole("button", { name: "Exclude restricted content" })
    )
    fireEvent.click(screen.getByRole("button", { name: "Confirm and migrate" }))

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled())
  })

  it("submits without a choice when the scan found no restricted content", async () => {
    renderReview({ issueCount: 0, commentCount: 0, worklogCount: 0 })

    fireEvent.click(screen.getByRole("button", { name: "Confirm and migrate" }))

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled())
  })

  it("does not recheck conflicts after the final save while migration starts", async () => {
    renderReview({ issueCount: 0, commentCount: 0, worklogCount: 0 })
    const nextRevisionConflicts = jiraDestinationConflictsAtom({
      params: { orgSlug: "example", migrationId: "migration" },
      query: { expectedRevision: 15 }
    })
    let failRun: ((exit: ReturnType<typeof Exit.fail>) => void) | undefined
    mocks.mutate
      .mockResolvedValueOnce(Exit.succeed({ ...detail, revision: 15 }))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            failRun = resolve
          })
      )

    fireEvent.click(screen.getByRole("button", { name: "Confirm and migrate" }))
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2))

    expect(mocks.observedAtoms).not.toContain(nextRevisionConflicts)

    await act(async () => {
      failRun?.(
        Exit.fail(new Conflict({ reason: "jira_migration_revision_conflict" }))
      )
    })
    await waitFor(() =>
      expect(mocks.observedAtoms).toContain(nextRevisionConflicts)
    )
  })
})
