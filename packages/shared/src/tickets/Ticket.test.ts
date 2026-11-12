import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  CreateTicketInput,
  StoredTicketType,
  TicketId,
  UpdateTicketInput
} from "./Ticket"
import { TicketActivityChange } from "./TicketActivity"

const decodeTicketId = Schema.decodeUnknownExit(TicketId)

describe("TicketId", () => {
  it("accepts legacy T-prefixed ids", () => {
    expect(decodeTicketId("T-35")._tag).toBe("Success")
  })

  it("accepts project-key-prefixed ids across key lengths", () => {
    expect(decodeTicketId("FOO-1")._tag).toBe("Success")
    expect(decodeTicketId("A1B2-42")._tag).toBe("Success")
    expect(decodeTicketId("ABCDEFGHIJ-999")._tag).toBe("Success")
  })

  it("rejects malformed ids", () => {
    for (const value of ["FOO-0", "foo-1", "1FOO-1", "A-1", "FOO-BAR"]) {
      expect(decodeTicketId(value)._tag).toBe("Failure")
    }
  })
})

describe("ticket type", () => {
  const decodeStored = Schema.decodeUnknownSync(StoredTicketType)
  const decodeCreate = Schema.decodeUnknownExit(CreateTicketInput)
  const decodeUpdate = Schema.decodeUnknownExit(UpdateTicketInput)
  const decodeChange = Schema.decodeUnknownSync(TicketActivityChange)

  it("reads a stored other as no type and keeps every other key", () => {
    expect(decodeStored("other")).toBeNull()
    expect(decodeStored(null)).toBeNull()
    expect(decodeStored("bug")).toBe("bug")
    expect(decodeStored("incident-lite")).toBe("incident-lite")
  })

  it("accepts custom keys and null on write and rejects other", () => {
    expect(decodeCreate({ title: "a", type: "incident-lite" })._tag).toBe(
      "Success"
    )
    expect(decodeCreate({ title: "a", type: null })._tag).toBe("Success")
    expect(decodeCreate({ title: "a", type: "other" })._tag).toBe("Failure")
    expect(decodeUpdate({ type: null })._tag).toBe("Success")
    expect(decodeUpdate({ type: "other" })._tag).toBe("Failure")
  })

  it("reads stored activity that changed the type to or from other", () => {
    expect(
      decodeChange({ kind: "type_changed", from: "other", to: "bug" })
    ).toEqual({ kind: "type_changed", from: null, to: "bug" })
    expect(
      decodeChange({ kind: "type_changed", from: "incident-lite", to: null })
    ).toEqual({ kind: "type_changed", from: "incident-lite", to: null })
  })
})
