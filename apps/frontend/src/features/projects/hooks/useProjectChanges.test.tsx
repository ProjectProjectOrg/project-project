// @vitest-environment jsdom
import { RegistryContext } from "@effect/atom-react"
import { TicketId } from "@pp/shared"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import * as DateTime from "effect/DateTime"
import * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import type { ReactNode } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"

import { useProjectChanges } from "./useProjectChanges"

const fetchStub = stubFetch()
const ticketId = Schema.decodeSync(TicketId)("T-1")

class FakeEventSource extends EventTarget {
  static readonly CLOSED = 2
  static opened: Array<FakeEventSource> = []
  readyState = 0
  constructor(readonly url: string) {
    super()
    FakeEventSource.opened.push(this)
  }
  close() {
    this.readyState = FakeEventSource.CLOSED
  }
}

let visibility: DocumentVisibilityState = "visible"
let registry = Registry.make()

beforeEach(() => {
  FakeEventSource.opened = []
  visibility = "visible"
  vi.stubGlobal("EventSource", FakeEventSource)
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => visibility
  )
})

afterEach(() => {
  cleanup()
  registry.dispose()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const setVisibility = (next: DocumentVisibilityState) => {
  act(() => {
    visibility = next
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))
  })
}

const latest = () => {
  const source = FakeEventSource.opened.at(-1)
  if (source === undefined) throw new Error("No event stream opened")
  return source
}

const open = () => {
  act(() => {
    latest().dispatchEvent(new Event("open"))
  })
}

const send = (data: string) => {
  act(() => {
    latest().dispatchEvent(new MessageEvent("message", { data }))
  })
}

const advance = (ms: number) => {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

const mountComments = async () => {
  registry = Registry.make()
  let reads = 0
  fetchStub.set((input) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.endsWith("/tickets/T-1/comments")) reads++
    return Promise.resolve(Response.json([]))
  })
  registry.mount(comments(commentsRequest("org", "project", ticketId)))
  await waitFor(() => expect(reads).toBe(1))
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <RegistryContext.Provider value={registry}>
      {children}
    </RegistryContext.Provider>
  )
  return { wrapper, reads: () => reads }
}

it("refreshes comments only when the first connection receives a change that names them", async () => {
  const { wrapper, reads } = await mountComments()
  renderHook(() => useProjectChanges("org", "project", () => {}), { wrapper })
  expect(latest().url).toBe("/api/orgs/org/projects/project/tickets/events")

  open()
  send('[{"kind":"comments","id":"T-2"}]')
  await act(async () => {})
  expect(reads()).toBe(1)
  send('[{"kind":"tickets","id":"T-1"},{"kind":"comments","id":"T-1"}]')
  await waitFor(() => expect(reads()).toBe(2))
})

it("catches up once on the first heartbeat without repeating the opening reads", async () => {
  const { wrapper, reads } = await mountComments()
  renderHook(() => useProjectChanges("org", "project", () => {}), { wrapper })
  open()
  await act(async () => {})
  expect(reads()).toBe(1)
  send("[]")
  await waitFor(() => expect(reads()).toBe(2))
  send("[]")
  await act(async () => {})
  expect(reads()).toBe(2)
})

it("closes while hidden and catches up on reopening", async () => {
  const { wrapper, reads } = await mountComments()
  renderHook(() => useProjectChanges("org", "project", () => {}), { wrapper })
  const first = latest()
  open()

  setVisibility("hidden")
  expect(first.readyState).toBe(FakeEventSource.CLOSED)
  setVisibility("visible")
  expect(FakeEventSource.opened).toHaveLength(2)
  open()
  await waitFor(() => expect(reads()).toBe(2))
})

it("catches up when returning to a project with retained reads", async () => {
  const { wrapper, reads } = await mountComments()
  const first = renderHook(
    () => useProjectChanges("org", "project", () => {}),
    { wrapper }
  )
  open()
  first.unmount()

  renderHook(() => useProjectChanges("org", "project", () => {}), { wrapper })
  open()
  await waitFor(() => expect(reads()).toBe(2))
})

it("refreshes a stale read once on returning to the tab, through the stream's catch-up", async () => {
  const start = DateTime.toEpochMillis(
    DateTime.makeUnsafe("2026-11-01T12:00:00.000Z")
  )
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(start)
  const { wrapper, reads } = await mountComments()
  renderHook(() => useProjectChanges("org", "project", () => {}), { wrapper })
  open()
  vi.setSystemTime(start + 31_000)

  setVisibility("hidden")
  setVisibility("visible")
  expect(reads()).toBe(1)
  open()
  await waitFor(() => expect(reads()).toBe(2))
})

const followFrom = async (start: number) => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(start)
  const { wrapper, reads } = await mountComments()
  renderHook(() => useProjectChanges("org", "project", () => {}), { wrapper })
  open()
  return reads
}

const returnToTab = () => {
  setVisibility("hidden")
  setVisibility("visible")
}

const fail = () => {
  act(() => {
    latest().dispatchEvent(new Event("error"))
  })
}

it("refreshes a stale read on returning to the tab while the stream is down", async () => {
  const start = DateTime.toEpochMillis(
    DateTime.makeUnsafe("2026-11-01T12:00:00.000Z")
  )
  const reads = await followFrom(start)
  fail()
  vi.setSystemTime(start + 31_000)
  returnToTab()
  await waitFor(() => expect(reads()).toBe(2))
})

it("leaves returning to the tab to the stream again once it reconnects", async () => {
  const start = DateTime.toEpochMillis(
    DateTime.makeUnsafe("2026-11-01T12:00:00.000Z")
  )
  const reads = await followFrom(start)
  fail()
  open()
  await waitFor(() => expect(reads()).toBe(2))
  vi.setSystemTime(start + 31_000)
  returnToTab()
  expect(reads()).toBe(2)
})

it("reopens and catches up when the stream falls silent", async () => {
  const { wrapper, reads } = await mountComments()
  vi.useFakeTimers()
  renderHook(() => useProjectChanges("org", "project", () => {}), { wrapper })
  const first = latest()
  open()
  advance(59_000)
  send("[]")
  advance(59_000)
  expect(FakeEventSource.opened).toHaveLength(1)

  advance(1_000)
  expect(first.readyState).toBe(FakeEventSource.CLOSED)
  open()
  vi.useRealTimers()
  await waitFor(() => expect(reads()).toBe(3))
})

it("rewarms once a second after changes and at most every ten seconds", async () => {
  const { wrapper } = await mountComments()
  const rewarm = vi.fn<() => void>()
  vi.useFakeTimers()
  renderHook(() => useProjectChanges("org", "project", rewarm), { wrapper })
  const change = '[{"kind":"tickets","id":"T-1"}]'

  send(change)
  advance(999)
  expect(rewarm).not.toHaveBeenCalled()
  advance(1)
  expect(rewarm).toHaveBeenCalledTimes(1)

  send(change)
  advance(5_000)
  send(change)
  advance(4_999)
  expect(rewarm).toHaveBeenCalledTimes(1)
  advance(1)
  expect(rewarm).toHaveBeenCalledTimes(2)
})
