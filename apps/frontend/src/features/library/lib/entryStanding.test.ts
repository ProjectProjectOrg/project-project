import { describe, expect, it } from "vitest"

import {
  creatableLayers,
  entryView,
  groupEntries,
  standingOf
} from "./entryStanding"

const entry = (
  key: string,
  origin: "builtin" | "org" | "project",
  shadows: "builtin" | "org" | "project" | null = null,
  hidden = false
) => ({ key, origin, shadows, hidden })

const admin = { org: true, project: true }
const manager = { org: false, project: true }
const member = { org: false, project: false }

describe("standingOf", () => {
  it("reads a project's entries against the organization", () => {
    expect(standingOf(entry("bug", "builtin"), "project")).toBe("shared")
    expect(standingOf(entry("bug", "org", "builtin"), "project")).toBe("shared")
    expect(standingOf(entry("bug", "project", "org"), "project")).toBe(
      "changed"
    )
    expect(standingOf(entry("spike", "project"), "project")).toBe("own")
    expect(standingOf(entry("bug", "project", "org", true), "project")).toBe(
      "hidden"
    )
  })

  it("reads an organization's entries against the built-ins", () => {
    expect(standingOf(entry("bug", "builtin"), "org")).toBe("shared")
    expect(standingOf(entry("bug", "org", "builtin"), "org")).toBe("changed")
    expect(standingOf(entry("spike", "org"), "org")).toBe("own")
  })
})

describe("groupEntries", () => {
  it("keeps changed entries with the shared ones and hidden ones apart", () => {
    const groups = groupEntries(
      [
        entry("bug", "project", "org"),
        entry("chore", "org"),
        entry("feat", "builtin"),
        entry("release", "project", "org", true),
        entry("spike", "project")
      ],
      "project"
    )
    expect(groups.shared.map((item) => item.key)).toEqual([
      "bug",
      "chore",
      "feat"
    ])
    expect(groups.own.map((item) => item.key)).toEqual(["spike"])
    expect(groups.hidden.map((item) => item.key)).toEqual(["release"])
  })
})

describe("entryView", () => {
  it("keeps a shared entry read-only and offers both choices to an admin", () => {
    expect(entryView(entry("bug", "org"), "project", admin)).toEqual({
      standing: "shared",
      editable: false,
      canFork: true,
      canEditUpstream: true,
      canRevert: false,
      canHide: true,
      canShow: false,
      canDelete: false,
      notice: null
    })
  })

  it("offers a project manager only the project copy", () => {
    const view = entryView(entry("bug", "org"), "project", manager)
    expect(view.canFork).toBe(true)
    expect(view.canEditUpstream).toBe(false)
    expect(view.notice).toBe("org-admins")
  })

  it("offers a member nothing", () => {
    for (const item of [
      entry("bug", "org"),
      entry("bug", "project", "org"),
      entry("spike", "project"),
      entry("release", "project", "org", true)
    ]) {
      const view = entryView(item, "project", member)
      expect(view.notice).toBe("project-managers")
      expect([
        view.editable,
        view.canFork,
        view.canEditUpstream,
        view.canRevert,
        view.canHide,
        view.canShow,
        view.canDelete
      ]).toEqual([false, false, false, false, false, false, false])
    }
  })

  it("makes a changed entry editable and revertible, not deletable", () => {
    const view = entryView(entry("bug", "project", "org"), "project", manager)
    expect(view.editable).toBe(true)
    expect(view.canRevert).toBe(true)
    expect(view.canDelete).toBe(false)
    expect(view.canHide).toBe(false)
    expect(view.notice).toBe(null)
  })

  it("lets the owning layer delete its own entry", () => {
    expect(
      entryView(entry("spike", "project"), "project", manager)
    ).toMatchObject({ editable: true, canDelete: true, canRevert: false })
    expect(entryView(entry("spike", "org"), "org", admin)).toMatchObject({
      editable: true,
      canDelete: true
    })
  })

  it("offers only show again on a hidden entry", () => {
    expect(
      entryView(entry("release", "project", "org", true), "project", manager)
    ).toMatchObject({
      standing: "hidden",
      editable: false,
      canShow: true,
      canFork: false,
      canHide: false
    })
  })

  it("applies the same rules to built-ins in an organization", () => {
    expect(entryView(entry("bug", "builtin"), "org", admin)).toMatchObject({
      standing: "shared",
      editable: false,
      canFork: true,
      canEditUpstream: false,
      canHide: false,
      canDelete: false
    })
    expect(
      entryView(entry("bug", "org", "builtin"), "org", admin)
    ).toMatchObject({
      standing: "changed",
      editable: true,
      canRevert: true,
      canDelete: false
    })
    expect(entryView(entry("bug", "builtin"), "org", manager)).toMatchObject({
      canFork: false,
      notice: "org-admins"
    })
  })
})

describe("creatableLayers", () => {
  it("offers a project manager the project and an admin both layers", () => {
    expect(creatableLayers("project", manager)).toEqual(["project"])
    expect(creatableLayers("project", admin)).toEqual(["project", "org"])
    expect(creatableLayers("project", member)).toEqual([])
  })

  it("offers only the organization layer in organization settings", () => {
    expect(creatableLayers("org", admin)).toEqual(["org"])
    expect(creatableLayers("org", manager)).toEqual([])
  })
})
