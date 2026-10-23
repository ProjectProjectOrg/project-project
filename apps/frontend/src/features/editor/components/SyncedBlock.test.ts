import type { Library } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { BUILTIN_LIBRARY } from "../lib/blockChrome"
import { syncedEditAction } from "./SyncedBlock"

describe("syncedEditAction", () => {
  const ADOPTED: Library = { ...BUILTIN_LIBRARY }
  const ALL = { org: true, project: true }
  const NONE = { org: false, project: false }

  it("never offers edit while the library is the built-in gallery", () => {
    expect(syncedEditAction(BUILTIN_LIBRARY, "org", ALL)).toBe("none")
    expect(syncedEditAction(BUILTIN_LIBRARY, "project", NONE)).toBe("none")
  })

  it("offers edit on the layer the viewer can change", () => {
    expect(
      syncedEditAction(ADOPTED, "org", { org: true, project: false })
    ).toBe("edit")
    expect(
      syncedEditAction(ADOPTED, "org", { org: false, project: true })
    ).toBe("managed")
    expect(syncedEditAction(ADOPTED, "project", NONE)).toBe("managed")
  })
})
