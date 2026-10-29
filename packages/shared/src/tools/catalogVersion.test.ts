import { describe, expect, it } from "vitest"

import { catalogVersion, toolInputVersions } from "./catalogVersion"
import { Tools } from "./Tools"

describe("catalogVersion", () => {
  it("fingerprints each tool's input schema, and the catalog as a whole", () => {
    expect(Object.keys(toolInputVersions).toSorted()).toEqual(
      Object.keys(Tools.tools).toSorted()
    )
    for (const version of Object.values(toolInputVersions)) {
      expect(version).toMatch(/^[0-9a-f]{8}$/)
    }
    expect(catalogVersion).toMatch(/^[0-9a-f]{8}$/)
  })

  it("gives tools with the same input the same version", () => {
    expect(toolInputVersions.attach_branch).toBe(toolInputVersions.stack_branch)
    expect(toolInputVersions.get_ticket).not.toBe(toolInputVersions.get_group)
  })
})
