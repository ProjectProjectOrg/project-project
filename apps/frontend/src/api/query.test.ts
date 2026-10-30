import { Tag, TagColor, TagName } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest"

import { tagsFor, tagsRequest, updateTag } from "@/features/tags/atoms/tags"

import { Api } from "./Api"
import { Keys, projectScope } from "./keys"
import { query } from "./query"
import { stubFetch } from "./testFetch"

const encode = Schema.encodeSync(Tag)
const before = Schema.decodeSync(TagName)("before")
const after = Schema.decodeSync(TagName)("after")
const tag = {
  name: before,
  color: Schema.decodeSync(TagColor)("#7c3aed"),
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
} satisfies Tag

const fetchStub = stubFetch()
const tab = new EventTarget()
const visibility = { visibilityState: "visible" }

beforeAll(() => {
  vi.stubGlobal("window", tab)
  vi.stubGlobal("document", visibility)
})

const start = DateTime.toEpochMillis(
  DateTime.makeUnsafe("2026-10-30T12:00:00.000Z")
)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(start)
})

afterEach(() => {
  vi.useRealTimers()
})

const elapse = (ms: number) => vi.setSystemTime(start + ms)

const returnToTab = () => tab.dispatchEvent(new Event("visibilitychange"))

const tagsSource = (slug: string) =>
  Api.query("tags", "list", {
    params: { orgSlug: "acme", slug },
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.tags(projectScope("acme", slug))]
  })

const serving = (tags: () => ReadonlyArray<Tag>) => {
  const gets = vi.fn(() =>
    Promise.resolve(Response.json(tags().map((t) => encode(t))))
  )
  return gets
}

describe("query revalidation", () => {
  it("shares one revalidating atom between equal requests", () => {
    const request = () =>
      query("tags", "list", {
        params: { orgSlug: "acme", slug: "shared" },
        timeToLive: "2 minutes"
      })
    expect(request()).toBe(request())
  })

  it("refetches a stale open view when the tab becomes visible", async () => {
    const gets = serving(() => [tag])
    fetchStub.set(gets)
    const registry = AtomRegistry.make()
    const view = tagsFor(tagsRequest("acme", "focus"))
    registry.mount(view)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      )
      elapse(31_000)
      returnToTab()
      await vi.waitFor(() => expect(gets).toHaveBeenCalledTimes(2))
    } finally {
      registry.dispose()
    }
  })

  it("leaves fresh data alone when the tab becomes visible", async () => {
    const gets = serving(() => [tag])
    fetchStub.set(gets)
    const registry = AtomRegistry.make()
    const view = tagsFor(tagsRequest("acme", "fresh"))
    registry.mount(view)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      )
      returnToTab()
      expect(gets).toHaveBeenCalledTimes(1)
    } finally {
      registry.dispose()
    }
  })

  it("keeps loaded data when a background refetch can't reach the server", async () => {
    let offline = false
    const gets = vi.fn(() =>
      offline
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve(Response.json([encode(tag)]))
    )
    fetchStub.set(gets)
    const registry = AtomRegistry.make()
    const view = tagsFor(tagsRequest("acme", "offline"))
    registry.mount(view)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      )
      offline = true
      elapse(31_000)
      returnToTab()
      await vi.waitFor(() =>
        expect(registry.get(tagsSource("offline"))).toMatchObject({
          _tag: "Failure",
          waiting: false
        })
      )
      const shown = registry.get(view)
      if (!AsyncResult.isSuccess(shown)) throw new Error("lost the view")
      expect(shown.value.map((t) => t.name)).toEqual([before])
    } finally {
      registry.dispose()
    }
  })

  it("surfaces a typed error from a background refetch", async () => {
    let gone = false
    const gets = vi.fn(() =>
      Promise.resolve(
        gone
          ? Response.json({ _tag: "NotFound" }, { status: 404 })
          : Response.json([encode(tag)])
      )
    )
    fetchStub.set(gets)
    const registry = AtomRegistry.make()
    const view = tagsFor(tagsRequest("acme", "gone"))
    registry.mount(view)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      )
      gone = true
      elapse(31_000)
      returnToTab()
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Failure",
          waiting: false
        })
      )
    } finally {
      registry.dispose()
    }
  })

  it("surfaces a server error from a background refetch", async () => {
    let broken = false
    const gets = vi.fn(() =>
      Promise.resolve(
        broken
          ? new Response("boom", { status: 500 })
          : Response.json([encode(tag)])
      )
    )
    fetchStub.set(gets)
    const registry = AtomRegistry.make()
    const view = tagsFor(tagsRequest("acme", "broken"))
    registry.mount(view)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      )
      broken = true
      elapse(31_000)
      returnToTab()
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Failure",
          waiting: false
        })
      )
    } finally {
      registry.dispose()
    }
  })

  it("shows cached data on remount and refetches it in the background", async () => {
    const gets = serving(() => [tag])
    fetchStub.set(gets)
    const registry = AtomRegistry.make()
    const view = tagsFor(tagsRequest("acme", "remount"))
    const unmount = registry.mount(view)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      )
      unmount()
      await vi.waitFor(() => expect(registry.getNodes().has(view)).toBe(false))
      elapse(31_000)
      registry.mount(view)
      expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      await vi.waitFor(() => expect(gets).toHaveBeenCalledTimes(2))
    } finally {
      registry.dispose()
    }
  })

  it("keeps an open optimistic edit through a background refetch", async () => {
    let finish = (_response: Response) => {}
    const gets = serving(() => [tag])
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return gets()
    })
    const registry = AtomRegistry.make()
    const req = tagsRequest("acme", "optimistic")
    const view = tagsFor(req)
    const mutation = updateTag({ req, name: before })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )
      registry.set(mutation, { name: after })
      const shown: Array<string> = []
      registry.subscribe(view, (result) => {
        if (AsyncResult.isSuccess(result)) shown.push(result.value[0].name)
      })
      elapse(31_000)
      returnToTab()
      await vi.waitFor(() => expect(gets).toHaveBeenCalledTimes(2))
      expect(shown).not.toContain(before)
      const current = registry.get(view)
      if (!AsyncResult.isSuccess(current)) throw new Error("lost the view")
      expect(current.value[0].name).toBe(after)
      finish(Response.json(encode({ ...tag, name: after })))
    } finally {
      registry.dispose()
    }
  })
})
