import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import * as Statement from "./Statement"

const statement = Statement.make({
  ticket: Schema.Literals(["read", "create", "delete"]),
  sprint: Schema.Literals(["manage"])
})

const reader = statement.role({ ticket: ["read", "create"] })

const decode = Schema.decodeUnknownExit(statement.schema)

const encode = Schema.encodeSync(statement.schema)

describe("can", () => {
  it("allows a request whose every action is granted", () => {
    expect(reader.can({ ticket: ["read", "create"] })).toBe(true)
  })

  it("denies a request when one action is missing", () => {
    expect(reader.can({ ticket: ["read", "delete"] })).toBe(false)
  })

  it("requires every resource by default", () => {
    expect(reader.can({ ticket: ["read"], sprint: ["manage"] })).toBe(false)
  })

  it("allows any granted action when the connector is OR", () => {
    expect(reader.can({ ticket: ["delete", "read"] }, "OR")).toBe(true)
    expect(reader.can({ ticket: ["read"], sprint: ["manage"] }, "OR")).toBe(
      true
    )
  })

  it("denies an OR request when nothing requested is granted", () => {
    expect(reader.can({ ticket: ["delete"], sprint: ["manage"] }, "OR")).toBe(
      false
    )
  })

  it("denies an empty request and an empty action list", () => {
    expect(reader.can({})).toBe(false)
    expect(reader.can({ ticket: [] })).toBe(false)
  })

  it("denies everything for a role without grants", () => {
    expect(statement.role({}).can({ ticket: ["read"] })).toBe(false)
  })

  it("keeps resource and action apart when names contain a separator", () => {
    const separated = Statement.make({
      "a:b": Schema.Literals(["c"]),
      a: Schema.Literals(["b:c"])
    })
    expect(separated.role({ "a:b": ["c"] }).can({ a: ["b:c"] })).toBe(false)
  })
})

describe("all", () => {
  it("grants every declared action", () => {
    expect(statement.all).toStrictEqual({
      ticket: ["read", "create", "delete"],
      sprint: ["manage"]
    })
  })
})

describe("schema", () => {
  it("decodes a stored permission set", () => {
    expect(decode({ ticket: ["read"], sprint: ["manage"] })).toStrictEqual(
      Exit.succeed({ ticket: ["read"], sprint: ["manage"] })
    )
  })

  it("rejects an unknown action", () => {
    expect(Exit.isFailure(decode({ ticket: ["archive"] }))).toBe(true)
  })

  it("rejects an unknown resource instead of dropping it", () => {
    expect(
      Exit.isFailure(decode({ ticket: ["read"], billing: ["manage"] }))
    ).toBe(true)
    expect(Exit.isFailure(decode({ billing: [] }))).toBe(true)
  })

  it("round-trips a role's grants", () => {
    expect(decode(encode(reader.grants))).toStrictEqual(
      Exit.succeed(reader.grants)
    )
  })
})

describe("types", () => {
  it("rejects unknown resources and actions at compile time", () => {
    // @ts-expect-error
    const unknownResource = statement.role({ billing: ["manage"] })
    // @ts-expect-error
    const unknownAction = statement.role({ ticket: ["archive"] })
    // @ts-expect-error
    const unknownRequest = reader.can({ sprint: ["read"] })
    expect([
      unknownResource.grants,
      unknownAction.grants,
      unknownRequest
    ]).toHaveLength(3)
  })
})
