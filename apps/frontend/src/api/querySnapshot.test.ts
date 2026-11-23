import { Tag, TagColor, TagName } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { beforeAll, expect, it, vi } from "vitest"

import { tagsFor, tagsRequest, updateTag } from "@/features/tags/atoms/tags"

import { restoreQueries, shownQueries } from "./querySnapshot"
import { stubFetch, type FetchHandler } from "./testFetch"

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

beforeAll(() => {
  vi.stubGlobal("window", new EventTarget())
  vi.stubGlobal("document", { visibilityState: "visible" })
})

it("keeps the server values of shown reads, without failures, idle reads or predictions", async () => {
  const gets = vi.fn<FetchHandler>((input, init) => {
    if (init?.method === "PATCH") return new Promise<Response>(() => {})
    const url = String(input instanceof Request ? input.url : input)
    return Promise.resolve(
      url.includes("/broken/")
        ? new Response("boom", { status: 500 })
        : Response.json([encode(tag)])
    )
  })
  fetchStub.set(gets)
  const shown = tagsRequest("acme", "shown")
  const broken = tagsRequest("acme", "broken")
  const idle = tagsRequest("acme", "idle")
  const registry = AtomRegistry.make()
  const restored = AtomRegistry.make()
  try {
    registry.mount(tagsFor(shown))
    registry.mount(tagsFor(broken))
    const unmountIdle = registry.mount(tagsFor(idle))
    registry.mount(updateTag({ req: shown, name: before }))
    await vi.waitFor(() => {
      expect(AsyncResult.isSuccess(registry.get(tagsFor(shown)))).toBe(true)
      expect(AsyncResult.isFailure(registry.get(tagsFor(broken)))).toBe(true)
      expect(AsyncResult.isSuccess(registry.get(tagsFor(idle)))).toBe(true)
    })
    unmountIdle()
    await vi.waitFor(() =>
      expect(registry.getNodes().has(tagsFor(idle))).toBe(false)
    )
    registry.set(updateTag({ req: shown, name: before }), { name: after })
    expect(registry.get(tagsFor(shown))).toMatchObject({
      waiting: true,
      value: [{ name: after }]
    })

    restoreQueries(restored, shownQueries(registry))

    expect(restored.get(tagsFor(shown))).toMatchObject({
      _tag: "Success",
      value: [{ name: before }]
    })
    expect(AsyncResult.isInitial(restored.get(tagsFor(broken)))).toBe(true)
    expect(AsyncResult.isInitial(restored.get(tagsFor(idle)))).toBe(true)
  } finally {
    registry.dispose()
    restored.dispose()
  }
})

it("paints a restored read at once and revalidates it with one request", async () => {
  const renamed = { ...tag, name: after }
  let current = tag
  const gets = vi.fn<FetchHandler>(() =>
    Promise.resolve(Response.json([encode(current)]))
  )
  fetchStub.set(gets)
  const req = tagsRequest("acme", "restored")
  const registry = AtomRegistry.make()
  const restored = AtomRegistry.make()
  try {
    registry.mount(tagsFor(req))
    await vi.waitFor(() =>
      expect(registry.get(tagsFor(req))).toMatchObject({ waiting: false })
    )
    const snapshot = shownQueries(registry)
    current = renamed
    gets.mockClear()

    restoreQueries(restored, snapshot)
    const shown: Array<string> = []
    restored.subscribe(
      tagsFor(req),
      (result) => {
        shown.push(AsyncResult.isSuccess(result) ? result.value[0].name : "")
      },
      { immediate: true }
    )

    await vi.waitFor(() => expect(shown.at(-1)).toBe(after))
    expect(shown[0]).toBe(before)
    expect(shown).not.toContain("")
    expect(gets).toHaveBeenCalledTimes(1)
  } finally {
    registry.dispose()
    restored.dispose()
  }
})
