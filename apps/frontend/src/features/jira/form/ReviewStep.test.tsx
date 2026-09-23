import type { JiraMigrationRequirements } from "@pp/shared"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as DateTime from "effect/DateTime"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useAppForm } from "@/lib/form"

import { buildJiraMigrationDraft, jiraMigrationFormOpts } from "./opts"
import { ReviewStep } from "./ReviewStep"

const atomState = vi.hoisted(() => ({
  result: null as unknown
}))

vi.mock("@effect/atom-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@effect/atom-react")>()
  return {
    ...actual,
    useAtomSet: () => vi.fn(),
    useAtomValue: () => atomState.result ?? AsyncResult.initial(),
    useAtomRefresh: () => vi.fn()
  }
})

vi.mock("@/components/ErrorPage", () => ({
  ErrorPage: () => <div role="alert">Conflict check failed</div>
}))

afterEach(() => {
  cleanup()
  atomState.result = null
})

const cast = <T,>(value: unknown) => value as T

const requirementsWith = (
  restrictedContent: JiraMigrationRequirements["restrictedContent"]
): JiraMigrationRequirements => ({
  destination: {
    suggestedName: "Archive",
    suggestedSlug: cast("archive"),
    suggestedKey: cast("WWA")
  },
  identities: [],
  identityOptions: [],
  statuses: [],
  statusOptions: [],
  issueTypes: [],
  priorities: [],
  tags: [],
  activeFutureSprintChoices: [],
  restrictedContent,
  attachments: []
})

const summary = cast<Parameters<typeof ReviewStep>[0]["summary"]>({
  siteName: "Example",
  siteUrl: "https://example.atlassian.net",
  projectName: "Archive",
  projectKey: "WWA",
  scannedAt: DateTime.makeUnsafe("2026-09-16T10:00:00.000Z"),
  counts: {
    identities: 0,
    statuses: 0,
    issueTypes: 0,
    priorities: 0,
    tags: 0,
    issues: 125,
    comments: 0,
    attachments: 0,
    groups: 0,
    restrictions: 0
  },
  visibilityWarnings: []
})

function Harness({
  restrictedContent,
  attachments = [],
  failedAttachmentIds = []
}: {
  restrictedContent: JiraMigrationRequirements["restrictedContent"]
  attachments?: JiraMigrationRequirements["attachments"]
  failedAttachmentIds?: ReadonlyArray<string>
}) {
  const requirements = { ...requirementsWith(restrictedContent), attachments }
  const form = useAppForm({
    ...jiraMigrationFormOpts,
    defaultValues: buildJiraMigrationDraft(requirements, null)
  })
  return (
    <ReviewStep
      form={form}
      orgSlug="fixture-org"
      migrationId="migration-1"
      revision={2}
      requirements={requirements}
      summary={summary}
      failedAttachmentIds={failedAttachmentIds}
      waiting={false}
      error={null}
      onBack={() => {}}
      onNext={() => {}}
    />
  )
}

describe("ReviewStep restricted content", () => {
  it("hides the choice when the scan found no restricted content", () => {
    render(
      <Harness
        restrictedContent={{ issueCount: 0, commentCount: 0, worklogCount: 0 }}
      />
    )

    expect(screen.queryByText("Restricted content")).toBeNull()
    expect(screen.queryByText("Exclude restricted content")).toBeNull()
  })

  it("shows the choice when the scan found restricted content", () => {
    render(
      <Harness
        restrictedContent={{ issueCount: 2, commentCount: 0, worklogCount: 0 }}
      />
    )

    expect(screen.queryByText("Restricted content")).not.toBeNull()
    expect(screen.queryByText("Exclude restricted content")).not.toBeNull()
  })

  it("shows the choice when only worklogs are restricted", () => {
    render(
      <Harness
        restrictedContent={{ issueCount: 0, commentCount: 0, worklogCount: 3 }}
      />
    )

    expect(screen.queryByText("Restricted content")).not.toBeNull()
  })
})

describe("ReviewStep destination conflicts", () => {
  const restrictedContent = {
    issueCount: 0,
    commentCount: 0,
    worklogCount: 0
  }

  it("keeps Start disabled until the check completes", () => {
    render(<Harness restrictedContent={restrictedContent} />)

    expect(
      screen.getByText("Checking this destination for conflicts…")
    ).not.toBeNull()
    expect(
      screen
        .getByRole("button", { name: "Confirm and migrate" })
        .hasAttribute("disabled")
    ).toBe(true)
  })

  it("shows exact conflicts and keeps Start disabled", () => {
    atomState.result = AsyncResult.success([
      { kind: "project_slug", value: "fixture-application" },
      { kind: "project_key", value: "APP" },
      { kind: "ticket_id", value: "APP-1" }
    ])
    render(<Harness restrictedContent={restrictedContent} />)

    expect(
      screen.getByText(
        "Project URL slug fixture-application is already in use."
      )
    ).not.toBeNull()
    expect(
      screen.getByText("Project key APP is already used in this organization.")
    ).not.toBeNull()
    expect(
      screen.getByText("Ticket APP-1 already exists in this organization.")
    ).not.toBeNull()
    expect(
      screen
        .getByRole("button", { name: "Confirm and migrate" })
        .hasAttribute("disabled")
    ).toBe(true)
  })

  it("allows Start when no conflicts are found", () => {
    atomState.result = AsyncResult.success([])
    render(<Harness restrictedContent={restrictedContent} />)

    expect(screen.getByText("No destination conflicts found.")).not.toBeNull()
    expect(
      screen
        .getByRole("button", { name: "Confirm and migrate" })
        .hasAttribute("disabled")
    ).toBe(false)
  })

  it("requires acknowledging forced attachment skips before starting", () => {
    atomState.result = AsyncResult.success([])
    render(
      <Harness
        restrictedContent={restrictedContent}
        attachments={[
          {
            jiraAttachmentId: "attachment-1",
            filename: "video.mp4",
            byteSize: 100,
            forcedSkipReason: "unsupported_type"
          }
        ]}
      />
    )

    const start = screen.getByRole("button", { name: "Confirm and migrate" })
    expect(start.hasAttribute("disabled")).toBe(true)
    expect(
      screen.getByText(
        "Confirm that these files will be left out before starting."
      )
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("checkbox"))
    expect(start.hasAttribute("disabled")).toBe(false)
  })

  it("lets the user leave out a failed copy or retry it", () => {
    atomState.result = AsyncResult.success([])
    render(
      <Harness
        restrictedContent={restrictedContent}
        attachments={[
          {
            jiraAttachmentId: "attachment-1",
            filename: "notes.txt",
            byteSize: 100,
            forcedSkipReason: null
          }
        ]}
        failedAttachmentIds={["attachment-1"]}
      />
    )

    const start = screen.getByRole("button", { name: "Confirm and migrate" })
    expect(start.hasAttribute("disabled")).toBe(true)
    expect(
      screen.getByText(
        "Select a file to leave out, or go back to retry copying them all."
      )
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("checkbox", { name: /notes\.txt/ }))
    expect(start.hasAttribute("disabled")).toBe(true)
    expect(
      screen.getByText(
        "Confirm that these files will be left out before starting."
      )
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("checkbox", { name: /I understand/ }))
    expect(start.hasAttribute("disabled")).toBe(false)
  })

  it("keeps Start disabled when the conflict check fails", () => {
    atomState.result = AsyncResult.fail(new Error("Unavailable"))
    render(<Harness restrictedContent={restrictedContent} />)

    expect(screen.getByRole("alert").textContent).toBe("Conflict check failed")
    expect(
      screen
        .getByRole("button", { name: "Confirm and migrate" })
        .hasAttribute("disabled")
    ).toBe(true)
  })
})
