import {
  TicketContent,
  TicketContentLine,
  TicketDetail,
  TicketId
} from "@pp/shared"
import { makeTicketDetail } from "@pp/shared/tickets/testing"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Schema from "effect/Schema"
import { beforeAll, expect, it, vi } from "vitest"

import { Api } from "@/api/Api"
import { Keys, projectScope, type ReactivityKey } from "@/api/keys"
import { stubFetch } from "@/api/testFetch"
import { fireMutation } from "@/api/viewMutation"

import { fillTicketContent, fillTicketWindow } from "./ticketContentFill"
import { ticketDetail, ticketRequest } from "./ticketDetail"

const ticket = makeTicketDetail()
const encodeLines = Schema.encodeSync(Schema.Array(TicketContentLine))
const encodeDetail = Schema.encodeSync(TicketDetail)
const fetchStub = stubFetch()

beforeAll(() => {
  vi.stubGlobal("window", new EventTarget())
  vi.stubGlobal("document", { visibilityState: "visible" })
})

it("shows a filled ticket as loaded on its first read", async () => {
  const requests: Array<string> = []
  fetchStub.set((input, init) => {
    requests.push(`${init?.method ?? "GET"} ${new Request(input).url}`)
    return Promise.resolve(
      Response.json(
        encodeLines([
          TicketContentLine.cases.Found.make({
            id: ticket.id,
            content: TicketContent.cases.Detail.make({ value: ticket })
          })
        ])
      )
    )
  })
  const registry = AtomRegistry.make()
  fillTicketContent(registry, { orgSlug: "acme", slug: "web" }, [ticket.id])
  await vi.waitFor(() => expect(registry.preloadedSerializable.size).toBe(1))
  expect(requests).toEqual([
    "POST http://localhost/api/orgs/acme/projects/web/tickets/content"
  ])
  const view = ticketDetail(ticketRequest("acme", "web", ticket.id))
  registry.mount(view)
  expect(registry.get(view)).toEqual(
    expect.objectContaining({
      _tag: "Success",
      waiting: false,
      value: ticket
    })
  )
  registry.dispose()
})

it("fills the far window only when the near window has a gap", async () => {
  const bodies: Array<unknown> = []
  fetchStub.set(async (input, init) => {
    bodies.push(await new Request(input, init).json())
    return Response.json(encodeLines([]))
  })
  const registry = AtomRegistry.make()
  const params = { orgSlug: "acme", slug: "window" }
  const near = [TicketId.make("T-1"), TicketId.make("T-2")]
  const far = [...near, TicketId.make("T-3")]
  fillTicketWindow(registry, params, near, far)
  fillTicketWindow(registry, params, near, far)
  await vi.waitFor(() => expect(bodies).toHaveLength(1))
  expect(bodies[0]).toMatchObject({ ids: ["T-1", "T-2", "T-3"] })
  registry.dispose()
})

it("refetches kept tickets and drops the rest when the project changes", async () => {
  const far = makeTicketDetail({ id: TicketId.make("T-900") })
  let title = "before"
  fetchStub.set(async (input, init) => {
    const body = await new Request(input, init).text()
    return Response.json(
      encodeLines(
        [ticket, far].flatMap((found) =>
          body.includes(`"${found.id}"`)
            ? [
                TicketContentLine.cases.Found.make({
                  id: found.id,
                  content: TicketContent.cases.Detail.make({
                    value: { ...found, title }
                  })
                })
              ]
            : []
        )
      )
    )
  })
  const registry = AtomRegistry.make()
  const params = { orgSlug: "acme", slug: "edited" }
  fillTicketWindow(registry, params, [ticket.id], [ticket.id])
  fillTicketContent(registry, params, [far.id])
  await vi.waitFor(() => expect(registry.preloadedSerializable.size).toBe(2))
  title = "after"
  await fireMutation(
    registry,
    Api.runtime.fn(() =>
      Reactivity.invalidate([Keys.ticketsIn(projectScope("acme", "edited"))])
    ),
    undefined
  )
  await vi.waitFor(() =>
    expect(JSON.stringify([...registry.preloadedSerializable])).toContain(
      "after"
    )
  )
  expect(registry.preloadedSerializable.size).toBe(1)
  const view = ticketDetail(ticketRequest("acme", "edited", ticket.id))
  registry.mount(view)
  expect(registry.get(view)).toMatchObject({ value: { title: "after" } })
  registry.dispose()
})

const detailLine = (title: string) =>
  encodeLines([
    TicketContentLine.cases.Found.make({
      id: ticket.id,
      content: TicketContent.cases.Detail.make({ value: { ...ticket, title } })
    })
  ])

const invalidate = (registry: AtomRegistry.AtomRegistry, key: ReactivityKey) =>
  fireMutation(
    registry,
    Api.runtime.fn(() => Reactivity.invalidate([key])),
    undefined
  )

it("shows the edit on a ticket opened while its preload refills", async () => {
  let fills = 0
  const refills: Array<(response: Response) => void> = []
  fetchStub.set((_, init) => {
    if (init?.method !== "POST")
      return Promise.resolve(
        Response.json(encodeDetail({ ...ticket, title: "after" }))
      )
    fills += 1
    return fills === 1
      ? Promise.resolve(Response.json(detailLine("before")))
      : new Promise<Response>((resolve) => refills.push(resolve))
  })
  const registry = AtomRegistry.make()
  const params = { orgSlug: "acme", slug: "refilling" }
  fillTicketWindow(registry, params, [ticket.id], [ticket.id])
  await vi.waitFor(() => expect(registry.preloadedSerializable.size).toBe(1))
  await invalidate(registry, Keys.ticketsIn(projectScope("acme", "refilling")))
  await vi.waitFor(() => expect(refills).toHaveLength(1))
  const view = ticketDetail(ticketRequest("acme", "refilling", ticket.id))
  registry.mount(view)
  await vi.waitFor(() =>
    expect(registry.get(view)).toMatchObject({
      waiting: false,
      value: { title: "after" }
    })
  )
  registry.dispose()
})

it("shows the edit on a ticket opened after its first fill raced the edit", async () => {
  const fills: Array<(response: Response) => void> = []
  fetchStub.set((_, init) =>
    init?.method === "POST"
      ? new Promise<Response>((resolve) => fills.push(resolve))
      : Promise.resolve(
          Response.json(encodeDetail({ ...ticket, title: "after" }))
        )
  )
  const registry = AtomRegistry.make()
  fillTicketContent(registry, { orgSlug: "acme", slug: "racing" }, [ticket.id])
  await vi.waitFor(() => expect(fills).toHaveLength(1))
  await invalidate(registry, Keys.ticketsIn(projectScope("acme", "racing")))
  fills[0]?.(Response.json(detailLine("before")))
  await vi.waitFor(() => expect(registry.preloadedSerializable.size).toBe(1))
  const view = ticketDetail(ticketRequest("acme", "racing", ticket.id))
  registry.mount(view)
  await vi.waitFor(() =>
    expect(registry.get(view)).toMatchObject({
      waiting: false,
      value: { title: "after" }
    })
  )
  registry.dispose()
})

it("never shows a preloaded body from before an org library change", async () => {
  let title = "before"
  fetchStub.set((_, init) =>
    Promise.resolve(
      Response.json(
        init?.method === "POST"
          ? detailLine(title)
          : encodeDetail({ ...ticket, title })
      )
    )
  )
  const registry = AtomRegistry.make()
  fillTicketContent(registry, { orgSlug: "acme", slug: "library" }, [ticket.id])
  await vi.waitFor(() => expect(registry.preloadedSerializable.size).toBe(1))
  title = "after"
  await invalidate(registry, Keys.orgLibrary("acme"))
  const titles: Array<string> = []
  registry.subscribe(
    ticketDetail(ticketRequest("acme", "library", ticket.id)),
    (result) => {
      if (AsyncResult.isSuccess(result)) titles.push(result.value.title)
    },
    { immediate: true }
  )
  await vi.waitFor(() => expect(titles).toContain("after"))
  expect(titles).not.toContain("before")
  registry.dispose()
})
