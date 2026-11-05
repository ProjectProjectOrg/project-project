import { it as effectIt } from "@effect/vitest"
import { DEFAULT_WORK_TYPES, type OrgEverhourConfig } from "@pp/shared"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { describe, expect, it } from "vitest"

import { databaseLayer } from "../test/database"
import { everhourSpans } from "../test/tracing"
import { EverhourApiKeys } from "./ApiKeys"
import * as Client from "./Client"
import { EverhourHost } from "./Host"
import * as Integrations from "./Integrations"

const config: OrgEverhourConfig = { workTypes: DEFAULT_WORK_TYPES }

const openSprint = {
  groupId: "G-1",
  name: "Sprint One",
  everhourSectionId: "sec-1",
  status: "active" as const
}

const completedSprint = {
  groupId: "G-2",
  name: "Sprint Two",
  everhourSectionId: "sec-2",
  status: "archived" as const
}

describe("planWorkTypeTasks", () => {
  it("emits one task per work-type for each sprint section", () => {
    const plan = Integrations.planWorkTypeTasks(
      [openSprint, completedSprint],
      config
    )
    expect(plan).toHaveLength(DEFAULT_WORK_TYPES.length * 2)
    const forOpen = plan.filter((t) => t.groupId === "G-1")
    expect(forOpen.map((t) => t.workTypeKey)).toEqual(
      DEFAULT_WORK_TYPES.map((w) => w.key)
    )
  })

  it("names tasks '<sprint> — <work-type label>'", () => {
    const plan = Integrations.planWorkTypeTasks([openSprint], config)
    expect(plan.map((t) => t.name)).toEqual([
      "Sprint One — Development",
      "Sprint One — Design",
      "Sprint One — Project Management",
      "Sprint One — Meetings & Workshops",
      "Sprint One — Testing"
    ])
  })

  it("opens tasks for active sprints and closes them for completed ones", () => {
    const plan = Integrations.planWorkTypeTasks(
      [openSprint, completedSprint],
      config
    )
    expect(
      plan.filter((t) => t.groupId === "G-1").every((t) => t.status === "open")
    ).toBe(true)
    expect(
      plan
        .filter((t) => t.groupId === "G-2")
        .every((t) => t.status === "closed")
    ).toBe(true)
  })

  it("never produces a task keyed by a ticket — only (sprint, work-type)", () => {
    const plan = Integrations.planWorkTypeTasks(
      [openSprint, completedSprint],
      config
    )
    for (const task of plan) {
      expect(task.workTypeKey).toBeDefined()
      expect(DEFAULT_WORK_TYPES.map((w) => w.key)).toContain(task.workTypeKey)
      expect(task).not.toHaveProperty("ticketId")
    }
  })

  it("ignores sections that are not bound to a sprint group", () => {
    const plan = Integrations.planWorkTypeTasks(
      [{ ...openSprint, groupId: null }],
      config
    )
    expect(plan).toHaveLength(0)
  })
})

describe("workTypeTaskAction", () => {
  const desired = {
    groupId: "G-1",
    workTypeKey: "development",
    everhourSectionId: "sec-1",
    name: Integrations.workTypeTaskName("Sprint One", "Development"),
    status: "open" as const
  }

  it("creates when no row exists", () => {
    expect(Integrations.workTypeTaskAction(undefined, desired)).toBe("create")
  })

  it("is a no-op on a second run once the row matches (idempotent)", () => {
    expect(
      Integrations.workTypeTaskAction(
        { name: desired.name, status: "active" },
        desired
      )
    ).toBe("noop")
  })

  it("updates when the sprint name drifts", () => {
    expect(
      Integrations.workTypeTaskAction(
        { name: "Old Name — Development", status: "active" },
        desired
      )
    ).toBe("update")
  })

  it("updates when an open task's row is still archived", () => {
    expect(
      Integrations.workTypeTaskAction(
        { name: desired.name, status: "archived" },
        desired
      )
    ).toBe("update")
  })

  it("updates when a completed task's row is still active", () => {
    const closed = { ...desired, status: "closed" as const }
    expect(
      Integrations.workTypeTaskAction(
        { name: closed.name, status: "active" },
        closed
      )
    ).toBe("update")
    expect(
      Integrations.workTypeTaskAction(
        { name: closed.name, status: "archived" },
        closed
      )
    ).toBe("noop")
  })
})

describe("EverhourIntegrations tracing", () => {
  effectIt.effect(
    "traces each call, with getProfile under disconnectProfile",
    () =>
      Effect.gen(function* () {
        const integrations = yield* Integrations.EverhourIntegrations
        const spans = yield* everhourSpans(
          Effect.all([
            integrations.getProfile("user-1"),
            integrations.disconnectProfile("user-1")
          ])
        )
        expect(spans).toEqual([
          { name: "EverhourIntegrations.getProfile", parent: null },
          { name: "EverhourIntegrations.disconnectProfile", parent: null },
          {
            name: "EverhourIntegrations.getProfile",
            parent: "EverhourIntegrations.disconnectProfile"
          }
        ])
      }).pipe(
        Effect.provide(
          Integrations.layer.pipe(
            Layer.provide(
              Layer.mergeAll(
                Layer.mock(Client.Everhour, {}),
                Layer.mock(EverhourHost, {}),
                Layer.mock(EverhourApiKeys, {}),
                Layer.succeed(
                  Crypto.Crypto,
                  Crypto.make({
                    randomBytes: (size) => new Uint8Array(size),
                    digest: (_algorithm, data) => Effect.succeed(data)
                  })
                ),
                databaseLayer(() => Effect.succeed([]))
              )
            )
          )
        )
      )
  )
})
