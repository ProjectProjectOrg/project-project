import { TagName, TicketId, TicketStatus } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { sharedTicketFields } from "./sharedTicketFields"

const decodeTicketId = Schema.decodeSync(TicketId)
const decodeStatus = Schema.decodeSync(TicketStatus)

const tag = Schema.decodeSync(TagName)

const ticket = (id: string, status: string, tags: ReadonlyArray<string>) => ({
  id: decodeTicketId(id),
  title: id,
  status: decodeStatus(status),
  priority: "med" as const,
  type: "feat" as const,
  estimate: null,
  tags: tags.map((name) => tag(name)),
  assignees: []
})

describe("sharedTicketFields", () => {
  it("keeps values every ticket has and leaves the rest out", () => {
    const shared = sharedTicketFields([
      ticket("T-1", "todo", ["bug", "ui"]),
      ticket("T-2", "done", ["ui"])
    ])
    expect(shared.priority).toBe("med")
    expect(shared.status).toBeUndefined()
    expect(shared.tags).toEqual(["ui"])
  })
})
