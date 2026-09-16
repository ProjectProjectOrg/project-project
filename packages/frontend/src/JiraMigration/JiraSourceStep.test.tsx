import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import type {
  JiraConnection,
  JiraProjectChoice,
  JiraSite
} from "@projectproject/shared"
import * as DateTime from "effect/DateTime"
import { JiraSourceStep } from "./JiraSourceStep"

afterEach(cleanup)

const disconnected: JiraConnection = {
  status: "disconnected",
  reconnectReason: null,
  connectedAt: null
}

const connected: JiraConnection = {
  status: "connected",
  reconnectReason: null,
  connectedAt: DateTime.makeUnsafe("2026-09-14T12:00:00.000Z")
}

const sites: ReadonlyArray<JiraSite> = [
  {
    cloudId: "cloud-1",
    name: "Acme Jira",
    url: "https://acme.atlassian.net",
    avatarUrl: null
  }
]

const projects: ReadonlyArray<JiraProjectChoice> = [
  {
    id: "project-1",
    key: "ENG",
    name: "Engineering",
    projectTypeKey: "software",
    simplified: false,
    style: "classic",
    avatarUrl: null
  }
]

describe("JiraSourceStep", () => {
  it("offers Jira OAuth before source selection when disconnected", () => {
    render(
      <JiraSourceStep
        connection={disconnected}
        sites={[]}
        projects={[]}
        selectedCloudId=""
        selectedProjectId=""
        onCloudIdChange={vi.fn()}
        onProjectIdChange={vi.fn()}
        migrationApiAvailable={false}
      />
    )

    expect(
      screen.getByRole("link", { name: "Connect Jira" }).getAttribute("href")
    ).toContain("/api/integrations/jira/oauth/start")
    expect(screen.queryByLabelText("Jira site")).toBeNull()
  })

  it("shows the selected source and keeps scan disabled until the API exists", () => {
    render(
      <JiraSourceStep
        connection={connected}
        sites={sites}
        projects={projects}
        selectedCloudId="cloud-1"
        selectedProjectId="project-1"
        onCloudIdChange={vi.fn()}
        onProjectIdChange={vi.fn()}
        migrationApiAvailable={false}
      />
    )

    expect(screen.getByRole("combobox", { name: "Jira site" })).not.toBeNull()
    expect(screen.getByRole("combobox", { name: "Project" })).not.toBeNull()
    expect(screen.getByText("Acme Jira")).not.toBeNull()
    expect(screen.getByText("Engineering")).not.toBeNull()
    const scan = screen.getByRole("button", { name: "Scan project" })
    expect(scan instanceof HTMLButtonElement && scan.disabled).toBe(true)
    expect(
      screen.getByText(
        "Project scanning will be available as soon as the migration service is ready."
      )
    ).not.toBeNull()
  })
})
