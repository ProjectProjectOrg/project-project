import { GroupDetail, TicketId } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import type { GroupDocument } from "../groups/GroupDocs"
import { sprintEvents } from "./projectEvents"

const sprint = Schema.decodeUnknownSync(GroupDetail)({
  id: "G-1",
  name: "Sprint 4",
  kind: "sprint",
  tickets: [],
  color: "#aaaaaa",
  startsAt: null,
  endsAt: null,
  completedAt: null,
  createdBy: "user-1",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  body: ""
})
const completedAt = DateTime.toDate(DateTime.makeUnsafe("2026-10-20T00:00:00Z"))
const startsAt = DateTime.toDate(DateTime.makeUnsafe("2026-10-23T09:00:00Z"))
const ticket = Schema.decodeUnknownSync(TicketId)("T-1")

const kinds = (before: GroupDocument | null, after: GroupDocument | null) =>
  sprintEvents(before, after).map((event) => event.kind)

describe("sprintEvents", () => {
  it.each([
    ["creating a sprint", null, sprint, ["sprint_created"]],
    [
      "creating a scheduled sprint",
      null,
      { ...sprint, startsAt },
      ["sprint_created", "sprint_started"]
    ],
    [
      "renaming a sprint",
      sprint,
      { ...sprint, name: "Sprint 5" },
      ["sprint_renamed"]
    ],
    [
      "completing a sprint",
      sprint,
      { ...sprint, completedAt },
      ["sprint_completed"]
    ],
    [
      "reopening a sprint",
      { ...sprint, completedAt },
      sprint,
      ["sprint_reopened"]
    ],
    [
      "reopening and rescheduling a sprint",
      { ...sprint, completedAt },
      { ...sprint, startsAt },
      ["sprint_reopened", "sprint_started"]
    ],
    ["deleting a sprint", sprint, null, ["sprint_deleted"]],
    [
      "turning a sprint into an epic",
      sprint,
      { ...sprint, kind: "epic" as const },
      ["sprint_deleted"]
    ],
    ["changing tickets only", sprint, { ...sprint, tickets: [ticket] }, []],
    ["writing an epic", null, { ...sprint, kind: "epic" as const }, []]
  ])("%s", (_name, before, after, expected) => {
    expect(kinds(before, after)).toEqual(expected)
  })
})
