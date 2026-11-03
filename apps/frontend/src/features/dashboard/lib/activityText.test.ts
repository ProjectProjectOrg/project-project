import { ProjectStatus, RecentTicketActivity } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { activityText } from "./activityText"

const decodeActivity = Schema.decodeSync(RecentTicketActivity)
type ActorInput = Extract<
  typeof RecentTicketActivity.Encoded,
  { tag: "status_changed" }
>["actor"]

const user = (id: string, name: string) => ({
  id,
  email: `${id}@example.test`,
  name,
  username: null,
  image: null,
  createdAt: "2026-09-25T00:00:00Z",
  activeOrgSlug: null,
  personalGithub: { connected: false },
  editorPreference: "github" as const,
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
})

const statuses = [
  Schema.decodeSync(ProjectStatus)({
    slug: "shipped",
    label: "Shipped",
    icon: "CircleCheck",
    color: "#22c55e",
    orderKey: "a2",
    description: null,
    createdBy: "wouter",
    createdAt: "2026-09-25T00:00:00Z"
  })
]

const at = DateTime.formatIso(
  DateTime.subtract(DateTime.nowUnsafe(), { hours: 2 })
)

const statusBy = (actor: ActorInput) =>
  activityText(
    decodeActivity({
      tag: "status_changed",
      actor,
      at,
      from: "todo",
      to: "shipped"
    }),
    "viewer",
    statuses
  )

const assignedBy = (actor: ActorInput) =>
  activityText(
    decodeActivity({ tag: "assigned", actor, at }),
    "viewer",
    statuses
  )

const wouter: ActorInput = { kind: "user", user: user("wouter", "Wouter") }
const viewerAgent = {
  kind: "agent" as const,
  user: user("viewer", "Luuk"),
  client: { id: "c-1", name: "Claude" }
}
const github: ActorInput = { kind: "system", source: "github" }

describe("activityText", () => {
  it("names who moved the ticket, with the project's status label", () => {
    expect(statusBy(wouter)).toBe("Wouter moved this to Shipped 2 hours ago")
    expect(statusBy(github)).toBe("GitHub moved this to Shipped 2 hours ago")
  })

  it("reads the viewer's own actions, including through an agent, as You", () => {
    expect(statusBy(viewerAgent)).toBe("You moved this to Shipped 2 hours ago")
    expect(assignedBy(viewerAgent)).toBe("You assigned yourself 2 hours ago")
  })

  it("names who assigned the viewer and how", () => {
    expect(assignedBy(wouter)).toBe("Wouter assigned you 2 hours ago")
    expect(assignedBy({ ...viewerAgent, user: user("luuk", "Luuk") })).toBe(
      "Luuk via Claude assigned you 2 hours ago"
    )
  })

  it("falls back when the assignment has no recorded actor", () => {
    expect(
      activityText(decodeActivity({ tag: "assigned", at }), "viewer", statuses)
    ).toBe("Assigned to you 2 hours ago")
    expect(
      activityText(decodeActivity({ tag: "assigned" }), "viewer", statuses)
    ).toBe("Assigned to you")
  })
})
