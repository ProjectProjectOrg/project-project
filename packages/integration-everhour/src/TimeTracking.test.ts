import { it as effectIt } from "@effect/vitest"
import {
  DEFAULT_WORK_TYPES,
  ProjectScope,
  type OrgEverhourConfig
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { describe, expect, it } from "vitest"

import { databaseLayer } from "../test/database"
import { everhourSpans } from "../test/tracing"
import { EverhourApiKeys } from "./ApiKeys"
import * as Client from "./Client"
import { EverhourHost } from "./Host"
import * as TimeTracking from "./TimeTracking"

describe("timerComment", () => {
  it("stamps the ticket id and title", () => {
    expect(TimeTracking.timerComment("T-12", "Fix the thing")).toBe(
      "T-12 — Fix the thing"
    )
  })

  it("appends the user's note", () => {
    expect(TimeTracking.timerComment("T-12", "Fix the thing", "pairing")).toBe(
      "T-12 — Fix the thing — pairing"
    )
  })

  it("falls back to the bare ticket id when there is no title", () => {
    expect(TimeTracking.timerComment("T-12", null)).toBe("T-12")
  })

  it("is just the note for ticket-less (sprint) entries", () => {
    expect(TimeTracking.timerComment(null, null, "sprint planning")).toBe(
      "sprint planning"
    )
    expect(TimeTracking.timerComment(null, null)).toBe("")
  })
})

describe("summariseAttribution", () => {
  const rows = [
    { everhourUserId: "u-1", seconds: 3600 },
    { everhourUserId: "u-2", seconds: 1800 },
    { everhourUserId: "u-1", seconds: 600 }
  ]

  it("totals all seconds and isolates the actor's seconds", () => {
    expect(TimeTracking.summariseAttribution(rows, "u-1")).toEqual({
      totalSeconds: 6000,
      userSeconds: 4200
    })
  })

  it("reports zero user seconds when the actor has no Everhour identity", () => {
    expect(TimeTracking.summariseAttribution(rows, null)).toEqual({
      totalSeconds: 6000,
      userSeconds: 0
    })
  })
})

describe("resolveSprintForTicket", () => {
  const sprints = [
    { id: "G-1", tickets: ["T-1", "T-2"] },
    { id: "G-2", tickets: ["T-3"] }
  ]

  it("finds the sprint containing the ticket", () => {
    expect(TimeTracking.resolveSprintForTicket(sprints, "T-3")).toBe("G-2")
  })

  it("returns null when the ticket is in no sprint", () => {
    expect(TimeTracking.resolveSprintForTicket(sprints, "T-99")).toBeNull()
  })
})

describe("workTypeOptions", () => {
  it("projects the org config into ordered {key,label} options", () => {
    const config: OrgEverhourConfig = { workTypes: DEFAULT_WORK_TYPES }
    expect(TimeTracking.workTypeOptions(config)).toEqual([
      { key: "development", label: "Development" },
      { key: "design", label: "Design" },
      { key: "project_management", label: "Project Management" },
      { key: "meetings", label: "Meetings & Workshops" },
      { key: "testing", label: "Testing" }
    ])
  })

  it("sorts by order regardless of array order", () => {
    const config: OrgEverhourConfig = {
      workTypes: [
        { key: "b", label: "B", order: 2, isDefault: false },
        { key: "a", label: "A", order: 1, isDefault: true }
      ]
    }
    expect(TimeTracking.workTypeOptions(config).map((o) => o.key)).toEqual([
      "a",
      "b"
    ])
  })
})

describe("EverhourTimeTracking tracing", () => {
  const unlinkedProject = Layer.succeed(ProjectScope, {
    userId: "user-1",
    organizationId: "org-1",
    orgSlug: "acme",
    projectId: "project-1",
    slug: "website"
  } as ProjectScope["Service"])

  effectIt.effect("opens one span per service call", () =>
    Effect.gen(function* () {
      const time = yield* TimeTracking.EverhourTimeTracking
      const spans = yield* everhourSpans(
        Effect.all([
          time.workTypesForTicket("T-1"),
          time.ticketTimeSummary("T-1")
        ])
      )
      expect(spans).toEqual([
        { name: "EverhourTimeTracking.workTypesForTicket", parent: null },
        { name: "EverhourTimeTracking.ticketTimeSummary", parent: null }
      ])
    }).pipe(
      Effect.provide(
        Layer.merge(
          TimeTracking.layer.pipe(
            Layer.provide(
              Layer.mergeAll(
                Layer.mock(Client.Everhour, {}),
                Layer.mock(EverhourHost, {}),
                Layer.mock(EverhourApiKeys, {}),
                databaseLayer(() => Effect.succeed([]))
              )
            )
          ),
          unlinkedProject
        )
      )
    )
  )
})
