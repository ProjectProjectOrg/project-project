import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as DateTime from "effect/DateTime"
import type { JiraMigrationRequirements } from "@projectproject/shared"
import { useAppForm } from "@/lib/form"
import { jiraMigrationFormOpts } from "./opts"
import { ReviewStep } from "./ReviewStep"

vi.mock("@effect/atom-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@effect/atom-react")>()
  return {
    ...actual,
    useAtomSet: () => vi.fn(),
    useAtomValue: () => AsyncResult.initial()
  }
})

afterEach(cleanup)

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
  restrictedContent
}: {
  restrictedContent: JiraMigrationRequirements["restrictedContent"]
}) {
  const form = useAppForm(jiraMigrationFormOpts)
  return (
    <ReviewStep
      form={form}
      requirements={requirementsWith(restrictedContent)}
      summary={summary}
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
