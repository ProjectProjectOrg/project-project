import { RegistryContext } from "@effect/atom-react"
import { TicketListQuery, type TicketType } from "@pp/shared"
import { act, cleanup, renderHook } from "@testing-library/react"
import * as Result from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Schema from "effect/Schema"
import type { ReactNode } from "react"
import { afterEach, expect, it, vi } from "vitest"

import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"
import { stubFetch } from "@/api/testFetch"
import { backlog, backlogRequest } from "@/features/tickets/atoms/backlog"

import { useFilterPrefetch } from "./useFilterPrefetch"

const fetchStub = stubFetch()
const decodeQuery = Schema.decodeSync(TicketListQuery)
const source = {
  orgSlug: "acme",
  slug: "web",
  groupId: null,
  view: "list",
  grouping: "status"
} as const
const registries: Array<AtomRegistry.AtomRegistry> = []
const queryFor = (type: TicketType) =>
  decodeQuery({ rules: [{ field: "type", operator: "is", values: [type] }] })
const response = (total: number) =>
  Response.json({
    counts: { total, byStatus: { todo: total } },
    sections: { todo: { items: [], nextCursor: null } }
  })

const setup = () => {
  const registry = AtomRegistry.make()
  registries.push(registry)
  const hook = renderHook(() => useFilterPrefetch(source), {
    wrapper: ({ children }: Readonly<{ children: ReactNode }>) => (
      <RegistryContext value={registry}>{children}</RegistryContext>
    )
  })
  return { registry, ...hook }
}

afterEach(() => {
  cleanup()
  for (const registry of registries.splice(0)) registry.dispose()
})

it("bounds speculative reads, keeps the latest queued intent and lets a selection start immediately", async () => {
  const replies: Array<(response: Response) => void> = []
  fetchStub.set(() => new Promise<Response>((resolve) => replies.push(resolve)))
  const { registry, result } = setup()
  act(() => {
    for (const type of ["bug", "feat", "chore", "other"] as const)
      result.current(queryFor(type))
  })
  await vi.waitFor(() => expect(replies).toHaveLength(2))
  const selected = backlog(backlogRequest("acme", "web", queryFor("chore")))
  registry.mount(selected)
  await vi.waitFor(() => expect(replies).toHaveLength(3))
  await act(async () => replies[2](response(30)))
  await vi.waitFor(() =>
    expect(registry.get(selected)).toMatchObject({
      _tag: "Success",
      value: { counts: { total: 30 } }
    })
  )
  await act(async () => replies[0](response(10)))
  await vi.waitFor(() => expect(replies).toHaveLength(4))
  expect(registry.get(selected)).toMatchObject({
    value: { counts: { total: 30 } }
  })
})

it("reuses a prefetched server result for equivalent filters without changing chip order", async () => {
  const first = decodeQuery({
    rules: [
      { field: "type", operator: "is", values: ["feat", "bug"] },
      { field: "archived", operator: "isNot" }
    ]
  })
  const reordered = decodeQuery({
    rules: [
      { field: "archived", operator: "isNot" },
      { field: "type", operator: "is", values: ["bug", "feat"] }
    ]
  })
  let requests = 0
  fetchStub.set(() => {
    requests += 1
    return Promise.resolve(response(7))
  })
  const { registry, result } = setup()
  act(() => result.current(first))
  const destination = backlog(backlogRequest("acme", "web", reordered))
  await vi.waitFor(() =>
    expect(Result.isSuccess(registry.get(destination))).toBe(true)
  )
  registry.mount(destination)
  act(() => result.current(reordered))
  expect(requests).toBe(1)
  expect(first.rules?.map((rule) => rule.field)).toEqual(["type", "archived"])
  expect(first.rules?.[0]).toMatchObject({ values: ["feat", "bug"] })
})

it("keeps prefetched results connected to the normal ticket invalidation keys", async () => {
  let total = 1
  let requests = 0
  fetchStub.set(() => {
    requests += 1
    return Promise.resolve(response(total))
  })
  const { registry, result } = setup()
  const query = queryFor("bug")
  act(() => result.current(query))
  const destination = backlog(backlogRequest("acme", "web", query))
  await vi.waitFor(() =>
    expect(registry.get(destination)).toMatchObject({
      _tag: "Success",
      value: { counts: { total: 1 } }
    })
  )
  total = 2
  const invalidate = Api.runtime.fn((_input: void) =>
    Reactivity.invalidate(Keys.ticketsChanged("acme/web"))
  )
  registry.mount(invalidate)
  registry.set(invalidate, undefined)
  await vi.waitFor(() => expect(requests).toBe(2))
  registry.mount(destination)
  await vi.waitFor(() =>
    expect(registry.get(destination)).toMatchObject({
      value: { counts: { total: 2 } }
    })
  )
})
