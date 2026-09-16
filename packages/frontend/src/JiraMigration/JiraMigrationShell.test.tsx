import type { ComponentProps } from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import {
  jiraMigrationStageForStep,
  jiraMigrationStages,
  JiraMigrationShell
} from "./JiraMigrationShell"

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: ComponentProps<"a">) => (
    <a href="/projects" {...props}>
      {children}
    </a>
  )
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("JiraMigrationShell stages", () => {
  it("uses the eight task-level Paper stages", () => {
    expect(jiraMigrationStages.map((stage) => stage.label())).toEqual([
      "Connect Jira",
      "Choose source",
      "Scan project",
      "Link accounts",
      "Map project data",
      "Review migration",
      "Migrate",
      "Finish"
    ])
  })

  it("keeps detailed mapping screens within Map project data", () => {
    const mappingSteps = [
      "statuses",
      "types",
      "priorities",
      "planning",
      "destination"
    ] as const
    expect(mappingSteps.map((step) => jiraMigrationStageForStep(step))).toEqual(
      ["map", "map", "map", "map", "map"]
    )
  })

  it("makes only completed, revisitable stages accessible buttons", () => {
    const navigate = vi.fn()
    render(
      <JiraMigrationShell
        orgSlug="example"
        currentStep="review"
        onNavigate={navigate}
      >
        <div />
      </JiraMigrationShell>
    )

    for (const name of [
      "Connect Jira",
      "Choose source",
      "Scan project",
      "Link accounts",
      "Map project data"
    ]) {
      expect(screen.getByRole("button", { name })).not.toBeNull()
    }
    expect(
      screen.queryByRole("button", { name: "Review migration" })
    ).toBeNull()
    expect(
      document.querySelector("[aria-current='step']")?.textContent
    ).toContain("Review migration")

    fireEvent.click(screen.getByRole("button", { name: "Map project data" }))
    expect(navigate).toHaveBeenCalledWith("map")
  })

  it("keeps completed stages reachable while revisiting an earlier screen", () => {
    render(
      <JiraMigrationShell
        orgSlug="example"
        currentStep="connect"
        furthestStep="review"
        onNavigate={vi.fn()}
      >
        <div />
      </JiraMigrationShell>
    )

    expect(screen.queryByRole("button", { name: "Connect Jira" })).toBeNull()
    expect(screen.getByRole("button", { name: "Choose source" })).not.toBeNull()
    expect(screen.getByRole("button", { name: "Scan project" })).not.toBeNull()
    expect(
      screen.getByRole("button", { name: "Map project data" })
    ).not.toBeNull()
  })

  it("confirms inline before leaving an in-session configuration draft", () => {
    render(
      <JiraMigrationShell orgSlug="example" currentStep="statuses" confirmLeave>
        <div />
      </JiraMigrationShell>
    )

    expect(screen.queryByRole("link", { name: "Leave" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Leave migration" }))

    expect(screen.getByText("Leave? Unsaved changes are lost.")).not.toBeNull()
    expect(screen.getByRole("link", { name: "Leave" })).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.queryByRole("link", { name: "Leave" })).toBeNull()
  })

  it("leaves without confirming when there is no draft to lose", () => {
    render(
      <JiraMigrationShell orgSlug="example" currentStep="statuses">
        <div />
      </JiraMigrationShell>
    )

    expect(
      screen.getByRole("link", { name: "Leave migration" })
    ).not.toBeNull()
  })
})
