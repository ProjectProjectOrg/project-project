import { describe, expect, it } from "vitest"

import {
  panelTransition,
  projectNavActive,
  sidebarScope,
  SidebarScope
} from "./sidebarRoute"

describe("sidebarScope", () => {
  it("puts the org dashboard and all projects in the dashboard scope", () => {
    expect(sidebarScope("/orgs/acme", "acme", undefined)).toEqual(
      SidebarScope.dashboard({ page: "overview" })
    )
    expect(sidebarScope("/orgs/acme/projects", "acme", undefined)).toEqual(
      SidebarScope.dashboard({ page: "projects" })
    )
  })

  it("keeps org settings and profile out of every scope", () => {
    expect(
      sidebarScope("/orgs/acme/settings/general", "acme", undefined)
    ).toEqual(SidebarScope.none())
    expect(sidebarScope("/profile/account", "acme", undefined)).toEqual(
      SidebarScope.none()
    )
  })

  it("scopes a project's settings to the project", () => {
    expect(
      sidebarScope(
        "/orgs/acme/projects/web/settings/workflow",
        "acme",
        undefined
      )
    ).toEqual(
      SidebarScope.project({
        slug: "web",
        route: { page: "settings", sub: "workflow" },
        viewing: null
      })
    )
  })

  it("views the ticket and lights Backlog, or Sprints when opened from one", () => {
    const plain = sidebarScope(
      "/orgs/acme/projects/web/tickets/WEB-3",
      "acme",
      undefined
    )
    expect(plain).toMatchObject({
      route: { page: "backlog" },
      viewing: { _tag: "ticket", ref: "WEB-3" }
    })
    const fromSprint = sidebarScope(
      "/orgs/acme/projects/web/tickets/WEB-3",
      "acme",
      "s1"
    )
    expect(fromSprint).toMatchObject({
      route: { page: "sprints", sub: "s1" },
      viewing: { _tag: "ticket", ref: "WEB-3" }
    })
  })

  it("views a sprint by id but not the current-sprint alias", () => {
    expect(
      sidebarScope("/orgs/acme/projects/web/sprints/G-4", "acme", undefined)
    ).toMatchObject({ viewing: { _tag: "sprint" } })
    expect(
      sidebarScope("/orgs/acme/projects/web/sprints/current", "acme", undefined)
    ).toMatchObject({ viewing: null })
  })
})

describe("projectNavActive", () => {
  it("lights Current for the running sprint and Sprints for any other", () => {
    expect(projectNavActive({ page: "sprints", sub: "s1" }, "s1", false)).toBe(
      "current"
    )
    expect(projectNavActive({ page: "sprints", sub: "s2" }, "s1", false)).toBe(
      "sprints"
    )
  })

  it("leaves the nav dark when a pinned row is the current page", () => {
    expect(projectNavActive({ page: "backlog", sub: null }, null, true)).toBe(
      null
    )
  })
})

describe("panelTransition", () => {
  const order = ["dash", "atlas", "billing"]

  it("moves up when the new rail item is below the old one", () => {
    expect(panelTransition("dash", "billing", order)).toBe("up")
    expect(panelTransition("billing", "atlas", order)).toBe("down")
  })

  it("drills forward into settings and back out of it", () => {
    expect(panelTransition("atlas", "settings", order)).toBe("forward")
    expect(panelTransition("settings", "dash", order)).toBe("back")
  })
})
