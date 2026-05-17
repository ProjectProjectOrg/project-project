import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"
import { CreatableProjectKey, ProjectKey } from "./Project"

const decodeCreatable = Schema.decodeUnknownEither(CreatableProjectKey)
const decodeProjectKey = Schema.decodeUnknownEither(ProjectKey)

describe("ProjectKey", () => {
  it("accepts the legacy T key", () => {
    expect(decodeProjectKey("T")._tag).toBe("Right")
  })

  it("accepts uppercase alphanumeric keys that start with a letter", () => {
    expect(decodeCreatable("FOO")._tag).toBe("Right")
    expect(decodeCreatable("A1B2")._tag).toBe("Right")
    expect(decodeCreatable("ABCDEFGHIJ")._tag).toBe("Right")
  })

  it("rejects invalid keys for new projects", () => {
    for (const value of ["T", "foo", "1FOO", "A-1", "ABCDEFGHIJK"]) {
      expect(decodeCreatable(value)._tag).toBe("Left")
    }
  })
})
