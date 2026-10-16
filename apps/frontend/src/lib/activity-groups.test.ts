import {
  GroupId,
  UserId,
  type ActivityCause,
  type GroupKind,
  type TicketActivityActor,
  type TicketActivityEntry,
  type User
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { activityItems, groupActivity } from "./activity-groups"

const userId = Schema.decodeUnknownSync(UserId)
const groupId = Schema.decodeUnknownSync(GroupId)

const user = (id: string): User => ({
  id: userId(id),
  email: `${id}@example.com`,
  name: id,
  username: null,
  image: null,
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00Z")),
  activeOrgSlug: null,
  personalGithub: { connected: false },
  editorPreference: "github",
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
})

const wouter: TicketActivityActor = { kind: "user", user: user("wouter") }
const luuk: TicketActivityActor = { kind: "user", user: user("luuk") }
const luukViaClaude: TicketActivityActor = {
  kind: "agent",
  user: user("luuk"),
  client: { id: "claude", name: "Claude" }
}

const localDate = (localTime: string): Date => {
  const [date, time] = localTime.split("T")
  const [year, month, day] = date.split("-").map(Number)
  const [hour, minute] = time.split(":").map(Number)
  // @effect-diagnostics-next-line globalDate:off
  return new Date(year, month - 1, day, hour, minute)
}

const entry = (
  id: string,
  localTime: string,
  actor: TicketActivityActor
): TicketActivityEntry => ({
  kind: "change",
  id,
  occurredAt: localDate(localTime),
  actor,
  cause: null,
  change: { kind: "description_edited" }
})

const shape = (entries: ReadonlyArray<TicketActivityEntry>) =>
  groupActivity(entries).map((day) =>
    day.groups.map((group) => group.entries.map((item) => item.id))
  )

describe("groupActivity", () => {
  it("groups one person's back-to-back changes within half an hour", () => {
    expect(
      shape([
        entry("c", "2026-10-16T12:40:00", wouter),
        entry("b", "2026-10-16T12:20:00", wouter),
        entry("a", "2026-10-16T11:55:00", wouter)
      ])
    ).toEqual([[["c", "b", "a"]]])
  })

  it("starts a new group after a half-hour gap", () => {
    expect(
      shape([
        entry("b", "2026-10-16T12:40:00", wouter),
        entry("a", "2026-10-16T12:00:00", wouter)
      ])
    ).toEqual([[["b"], ["a"]]])
  })

  it("starts a new group when someone else acts in between", () => {
    expect(
      shape([
        entry("c", "2026-10-16T12:10:00", wouter),
        entry("b", "2026-10-16T12:05:00", luuk),
        entry("a", "2026-10-16T12:00:00", wouter)
      ])
    ).toEqual([[["c"], ["b"], ["a"]]])
  })

  it("keeps a person and the same person via an agent apart", () => {
    expect(
      shape([
        entry("b", "2026-10-16T12:05:00", luukViaClaude),
        entry("a", "2026-10-16T12:00:00", luuk)
      ])
    ).toEqual([[["b"], ["a"]]])
  })

  it("never groups across midnight", () => {
    expect(
      shape([
        entry("b", "2026-10-16T00:05:00", wouter),
        entry("a", "2026-10-15T23:55:00", wouter)
      ])
    ).toEqual([[["b"]], [["a"]]])
  })
})

const membership = (
  id: string,
  localTime: string,
  kind: "group_added" | "group_removed",
  name: string,
  options: Readonly<{ groupKind?: GroupKind; cause?: ActivityCause }> = {}
): TicketActivityEntry => ({
  kind: "change",
  id,
  occurredAt: localDate(localTime),
  actor: wouter,
  cause: options.cause ?? null,
  change: {
    kind,
    groupId: groupId(`G-${name.length}`),
    groupKind: options.groupKind ?? "sprint",
    name
  }
})

const lines = (entries: ReadonlyArray<TicketActivityEntry>) =>
  activityItems(entries).map((item) =>
    item.kind === "entry"
      ? item.entry.id
      : `${item.from} -> ${item.to}${item.cause ? ` (${item.cause})` : ""}`
  )

describe("activityItems", () => {
  it("reads leaving one sprint and joining another as one move", () => {
    expect(
      lines([
        entry("edit", "2026-10-16T12:05:00", wouter),
        membership("in", "2026-10-16T12:00:01", "group_added", "Sprint 13"),
        membership("out", "2026-10-16T12:00:00", "group_removed", "Sprint 12")
      ])
    ).toEqual(["edit", "Sprint 12 -> Sprint 13"])
  })

  it("keeps the cause of a carryover", () => {
    expect(
      lines([
        membership("in", "2026-10-16T12:00:00", "group_added", "Sprint 13", {
          cause: "sprint_completed"
        }),
        membership("out", "2026-10-16T12:00:00", "group_removed", "Sprint 12", {
          cause: "sprint_completed"
        })
      ])
    ).toEqual(["Sprint 12 -> Sprint 13 (sprint_completed)"])
  })

  it("leaves sprint changes apart when they are not one move", () => {
    expect(
      lines([
        membership("later", "2026-10-16T12:05:00", "group_added", "Sprint 13"),
        membership("out", "2026-10-16T12:00:00", "group_removed", "Sprint 12"),
        membership("epic", "2026-10-16T11:00:01", "group_added", "Billing", {
          groupKind: "epic"
        }),
        membership("old", "2026-10-16T11:00:00", "group_removed", "Platform", {
          groupKind: "epic"
        })
      ])
    ).toEqual(["later", "out", "epic", "old"])
  })
})
