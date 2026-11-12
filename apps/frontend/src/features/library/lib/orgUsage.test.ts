import {
  BUILTIN_TYPES,
  EMPTY_LAYER,
  resolveLibrary,
  type Layer
} from "@pp/shared"
import { describe, expect, it } from "vitest"

import { entryUsage, type ProjectLibrary } from "./orgUsage"

const bug = BUILTIN_TYPES.find((type) => type.key === "bug")!

const projectLibrary = (slug: string, layer: Layer): ProjectLibrary => ({
  project: { slug, name: slug.toUpperCase() },
  library: resolveLibrary({ org: EMPTY_LAYER, project: layer }, true)
})

const libraries = [
  projectLibrary("api", EMPTY_LAYER),
  projectLibrary("mobile", {
    ...EMPTY_LAYER,
    types: [{ ...bug, name: "Defect" }],
    hiddenBlocks: ["environment"]
  }),
  projectLibrary("web", { ...EMPTY_LAYER, hiddenTypes: ["chore"] })
]

describe("entryUsage", () => {
  it("counts the projects that use an entry as is", () => {
    expect(entryUsage(libraries, "type", "feat")).toEqual({
      projects: 3,
      asIs: 3,
      changedIn: [],
      hiddenIn: []
    })
  })

  it("names the projects that changed or hid an entry", () => {
    expect(entryUsage(libraries, "type", "bug")).toMatchObject({
      asIs: 2,
      changedIn: [{ slug: "mobile", name: "MOBILE" }],
      hiddenIn: []
    })
    expect(entryUsage(libraries, "type", "chore")).toMatchObject({
      asIs: 2,
      changedIn: [],
      hiddenIn: [{ slug: "web", name: "WEB" }]
    })
    expect(entryUsage(libraries, "section", "environment")).toMatchObject({
      asIs: 2,
      hiddenIn: [{ slug: "mobile", name: "MOBILE" }]
    })
  })

  it("reports no projects for an organization without any", () => {
    expect(entryUsage([], "type", "bug")).toEqual({
      projects: 0,
      asIs: 0,
      changedIn: [],
      hiddenIn: []
    })
  })
})
