import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vite-plus/test"
import {
  JiraMigrationConfiguration,
  type JiraMigrationDetail
} from "@projectproject/shared"
import { Schema } from "effect"
import { m } from "@/paraglide/messages"
import { stubFetch } from "@/api/testFetch"
import { JiraProgressStep } from "./JiraProgressStep"
import { JiraTerminalStep } from "./JiraTerminalStep"

afterEach(cleanup)

const fetchStub = stubFetch()

const progressDetail = {
  status: "migrating",
  progress: { phase: "migrate", done: 4, total: 10 },
  actions: { canCancel: true }
} as JiraMigrationDetail

const terminalDetail = {
  id: "migration-1",
  status: "failed",
  destinationProjectSlug: null,
  actions: {
    canRetry: true,
    canConfigure: false,
    canRescan: true,
    canDiscard: true
  },
  failure: null
} as JiraMigrationDetail

const mutationError = m.jira_migration_error_generic()

it("shows cancel failures inline on the progress screen", () => {
  render(
    <JiraProgressStep
      detail={progressDetail}
      waiting={false}
      error={mutationError}
      onCancel={() => {}}
    />
  )

  expect(screen.getByRole("alert").textContent).toContain(
    "The Jira migration could not be updated. Try again."
  )
})

it("shows retry and rescan failures inline on the terminal screen", () => {
  render(
    <JiraTerminalStep
      detail={terminalDetail}
      orgSlug="example"
      waiting={false}
      error={mutationError}
      onRetry={() => {}}
      onRescan={() => {}}
    />
  )

  expect(screen.getByRole("alert").textContent).toContain(
    "The Jira migration could not be updated. Try again."
  )
})

it("offers discard when a cancelled migration is safe to clean up", () => {
  render(
    <JiraTerminalStep
      detail={{
        ...terminalDetail,
        status: "cancelled",
        actions: { ...terminalDetail.actions, canDiscard: true }
      }}
      orgSlug="example"
      waiting={false}
      onDiscard={() => {}}
    />
  )

  expect(screen.getByRole("button", { name: "Discard migration" })).toBeTruthy()
})

it("explains why a cancelled migration cannot yet be discarded", () => {
  render(
    <JiraTerminalStep
      detail={{
        ...terminalDetail,
        status: "cancelled",
        actions: { ...terminalDetail.actions, canDiscard: false }
      }}
      orgSlug="example"
      waiting={false}
      onDiscard={() => {}}
    />
  )

  expect(
    screen.getByRole("button", { name: "Can’t discard yet" })
  ).toHaveProperty("disabled", true)
  expect(
    screen.getByText(/A file upload or cleanup may still be finishing/)
  ).toBeTruthy()
})

it("shows Jira and destination links with replacement guidance after a successful import", async () => {
  fetchStub.set(async () =>
    Response.json([
      {
        sourceAttachmentId: "attachment-1",
        filename: "notes.txt",
        sourceIssueKey: "APP-1",
        targetTicketId: "APP-1",
        sourceIssueUrl: "https://example.atlassian.net/browse/APP-1",
        targetTicketUrl: "/orgs/example/projects/application/tickets/APP-1",
        replacement: "available"
      },
      {
        sourceAttachmentId: "attachment-2",
        filename: "demo.mp4",
        sourceIssueKey: "APP-1",
        targetTicketId: "APP-1",
        sourceIssueUrl: "https://example.atlassian.net/browse/APP-1",
        targetTicketUrl: "/orgs/example/projects/application/tickets/APP-1",
        replacement: "unsupported_type"
      },
      {
        sourceAttachmentId: "attachment-3",
        filename: "large.pdf",
        sourceIssueKey: "APP-1",
        targetTicketId: "APP-1",
        sourceIssueUrl: "https://example.atlassian.net/browse/APP-1",
        targetTicketUrl: "/orgs/example/projects/application/tickets/APP-1",
        replacement: "too_large"
      }
    ])
  )
  render(
    <JiraTerminalStep
      detail={{
        ...terminalDetail,
        status: "succeeded",
        destinationProjectSlug: null,
        reportPath: "imports/jira/migration-1/report.md",
        configuration: Schema.decodeUnknownSync(JiraMigrationConfiguration)({
          destination: { name: "Application", slug: "application", key: "APP" },
          identities: [],
          statuses: [],
          issueTypes: [],
          priorities: [],
          tags: [],
          activeFutureSprintChoices: [],
          restrictedContent: { policy: "exclude" },
          skippedAttachmentIds: [
            "attachment-1",
            "attachment-2",
            "attachment-3"
          ],
          attachmentSkipsAccepted: true
        })
      }}
      orgSlug="example"
      waiting={false}
    />
  )

  expect(await screen.findByText("notes.txt")).toBeTruthy()
  expect(screen.getByText("demo.mp4")).toBeTruthy()
  expect(screen.getByText("large.pdf")).toBeTruthy()
  expect(
    screen
      .getAllByRole("link", { name: "APP-1 in Jira" })[0]
      ?.getAttribute("href")
  ).toBe("https://example.atlassian.net/browse/APP-1")
  expect(
    screen
      .getAllByRole("link", { name: "APP-1 in ProjectProject" })[0]
      ?.getAttribute("href")
  ).toBe("/orgs/example/projects/application/tickets/APP-1")
  expect(screen.getByText(/Upload the downloaded file/)).toBeTruthy()
  expect(screen.getAllByText(/cannot be uploaded/)).toHaveLength(2)
  expect(screen.getByText(/25 MB upload limit/)).toBeTruthy()
  expect(screen.queryByText(/imports\/jira\/migration-1\/report.md/)).toBeNull()
})
