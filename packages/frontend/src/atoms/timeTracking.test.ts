import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"
import {
  ActiveTimer,
  GroupId,
  PersonalEverhour,
  TicketId,
  TicketTimeSummary,
  WorkTypeOption,
  type LogTimeInput
} from "@projectproject/shared"
import { stubFetch } from "@/api/testFetch"
import {
  activeTimerAtom,
  activeTimerRequest,
  logTicketTimeAtom,
  optimisticStopTimer,
  startActiveTicketTimerAtom,
  stopTimerAtom,
  ticketTimeAtom,
  ticketTimePanelAtom,
  ticketTimeRequest
} from "./timeTracking"

const groupId = Schema.decodeSync(GroupId)("G-1")
const ticketId = Schema.decodeSync(TicketId)("T-1")
const timer = {
  slug: "project",
  ticketId,
  ticketTitle: "Ticket",
  groupId,
  workTypeKey: "development",
  workTypeLabel: "Development",
  everhourTaskId: "task-1",
  startedAt: DateTime.toDate(DateTime.makeUnsafe("2026-06-22T10:00:00Z"))
} satisfies ActiveTimer

const profile = {
  connected: true,
  everhourUserId: "user-1",
  name: "Wouter",
  email: "wouter@example.com",
  lastVerifiedAt: null,
  lastCheckError: null
} satisfies PersonalEverhour

const workTypes = [{ key: "development", label: "Development" }]
const time = { ticketId, totalSeconds: 60, userSeconds: 60 }
const encodeTimer = Schema.encodeSync(Schema.NullOr(ActiveTimer))
const encodeProfile = Schema.encodeSync(PersonalEverhour)
const encodeWorkTypes = Schema.encodeSync(Schema.Array(WorkTypeOption))
const encodeTime = Schema.encodeSync(TicketTimeSummary)
const fetchStub = stubFetch()

const requestUrl = (input: RequestInfo | URL) =>
  typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url

const responseFor = (url: string, active: ActiveTimer | null = timer) => {
  if (url.endsWith("/integrations/everhour/profile")) {
    return Response.json(encodeProfile(profile))
  }
  if (url.endsWith("/everhour/work-types")) {
    return Response.json(encodeWorkTypes(workTypes))
  }
  if (url.endsWith("/everhour/time")) return Response.json(encodeTime(time))
  return Response.json(encodeTimer(active))
}

describe("optimisticStopTimer", () => {
  it("clears the active timer", () => {
    const result = optimisticStopTimer(AsyncResult.success(timer))
    expect(result).toMatchObject({ _tag: "Success", value: null })
  })
})

describe("time tracking views", () => {
  it("clears the active timer before stop resolves", async () => {
    let finish = (_response: Response) => {}
    let active: ActiveTimer | null = timer
    fetchStub.set((input, init) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(responseFor(requestUrl(input), active))
    })
    const registry = AtomRegistry.make()
    const req = activeTimerRequest("acme")
    const view = activeTimerAtom(req)
    const mutation = stopTimerAtom(req)
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ value: timer })
      )
      registry.set(mutation, undefined)
      expect(registry.get(view)).toMatchObject({ waiting: true, value: null })
      active = null
      finish(Response.json(encodeTimer(timer)))
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          waiting: false,
          value: null
        })
      )
    } finally {
      registry.dispose()
    }
  })

  it("holds the panel until all four refreshed sources settle", async () => {
    let refreshing = false
    let finishLog = (_response: Response) => {}
    const pendingGets: Array<() => void> = []
    fetchStub.set((input, init) => {
      const url = requestUrl(input)
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          finishLog = resolve
        })
      }
      if (!refreshing) return Promise.resolve(responseFor(url))
      return new Promise<Response>((resolve) => {
        pendingGets.push(() => resolve(responseFor(url)))
      })
    })
    const registry = AtomRegistry.make()
    const req = ticketTimeRequest("acme", "project", ticketId)
    const view = ticketTimePanelAtom(req)
    const mutation = logTicketTimeAtom(req)
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
      const input: LogTimeInput = {
        workTypeKey: "development",
        seconds: 60,
        date: "2026-06-22",
        ticketId
      }
      registry.set(mutation, input)
      expect(registry.get(view)).toMatchObject({
        waiting: true,
        value: { time: { totalSeconds: 120 } }
      })
      refreshing = true
      finishLog(
        Response.json(
          encodeTime({ ticketId, totalSeconds: 120, userSeconds: 120 })
        )
      )
      await vi.waitFor(() => expect(pendingGets).toHaveLength(4))
      for (const finish of pendingGets.slice(0, 3)) finish()
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          waiting: true,
          value: { time: { totalSeconds: 120 } }
        })
      )
      pendingGets[3]()
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
    } finally {
      registry.dispose()
    }
  })

  it("refreshes a previous project when ticket ids overlap", async () => {
    const previous = { ...timer, slug: "other" }
    let active = previous
    let previousTimeFetches = 0
    fetchStub.set((input, init) => {
      const request =
        input instanceof Request ? input : new Request(input, init)
      const url = new URL(request.url, "http://localhost")
      if (request.method === "POST") {
        active = { ...timer, slug: "project" }
        return Promise.resolve(Response.json(encodeTimer(active)))
      }
      if (url.pathname.endsWith("/integrations/everhour/profile")) {
        return Promise.resolve(Response.json(encodeProfile(profile)))
      }
      if (url.pathname.endsWith("/everhour/work-types")) {
        return Promise.resolve(Response.json(encodeWorkTypes(workTypes)))
      }
      if (url.pathname.endsWith("/everhour/time")) {
        if (url.pathname.includes("/projects/other/")) previousTimeFetches++
        return Promise.resolve(Response.json(encodeTime(time)))
      }
      return Promise.resolve(Response.json(encodeTimer(active)))
    })
    const registry = AtomRegistry.make()
    const previousView = ticketTimeAtom(
      ticketTimeRequest("acme", "other", ticketId)
    )
    const activeView = activeTimerAtom(activeTimerRequest("acme"))
    const mutation = startActiveTicketTimerAtom({
      timerReq: activeTimerRequest("acme"),
      ticketReq: ticketTimeRequest("acme", "project", ticketId)
    })
    registry.mount(previousView)
    registry.mount(activeView)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(previousView)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { workTypeKey: "development" })
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      expect(previousTimeFetches).toBeGreaterThan(1)
    } finally {
      registry.dispose()
    }
  })
})
