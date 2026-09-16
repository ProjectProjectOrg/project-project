import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it } from "vite-plus/test"
import type { JiraMigrationDetail } from "@projectproject/shared"
import { m } from "@/paraglide/messages"
import { JiraProgressStep } from "./JiraProgressStep"
import { JiraTerminalStep } from "./JiraTerminalStep"

afterEach(cleanup)

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
