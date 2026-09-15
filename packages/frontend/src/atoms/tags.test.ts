import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"
import {
  Tag,
  TagColor,
  TagName,
  TicketDetail,
  TicketId,
  TicketStatus
} from "@projectproject/shared"
import { stubFetch } from "@/api/testFetch"
import {
  deleteTag,
  deleteTagInEditor,
  tagEditor,
  tagEditorRequest,
  tagsFor,
  tagsRequest,
  updateTag,
  updateTagInEditor
} from "./tags"

const name = Schema.decodeSync(TagName)("before")
const nextName = Schema.decodeSync(TagName)("after")
const color = Schema.decodeSync(TagColor)("#7c3aed")
const tag = {
  name,
  color,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"))
} satisfies Tag
const renamed = { ...tag, name: nextName }
const encode = Schema.encodeSync(Tag)
const req = tagsRequest("acme", "web")
const ticket = {
  id: Schema.decodeSync(TicketId)("T-1"),
  title: "Tagged ticket",
  status: Schema.decodeSync(TicketStatus)("todo"),
  type: "chore",
  priority: "med",
  tags: [name],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch", baseBranch: "main" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  body: ""
} satisfies TicketDetail
const encodeTicket = Schema.encodeSync(TicketDetail)
const editorReq = tagEditorRequest("acme", "web", ticket.id)
const fetchStub = stubFetch()

describe("tags optimistic updates", () => {
  it("holds a rename until the list refetch lands", async () => {
    let served: ReadonlyArray<Tag> = [tag]
    let finish = (_response: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(Response.json(served.map((tag) => encode(tag))))
    })
    const registry = AtomRegistry.make()
    const view = tagsFor(req)
    const mutation = updateTag({ req, name })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(mutation, { name: nextName })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.waiting).toBe(true)
      expect(optimistic.value[0].name).toBe(nextName)

      served = [renamed]
      finish(Response.json(encode(renamed)))

      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value[0].name).toBe(nextName)
    } finally {
      registry.dispose()
    }
  })

  it("renames an applied tag through the editor view", async () => {
    let servedTags: ReadonlyArray<Tag> = [tag]
    let servedTicket: TicketDetail = ticket
    let finish = (_response: Response) => {}
    fetchStub.set((input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(
        Response.json(
          String(input).endsWith("/tags")
            ? servedTags.map((tag) => encode(tag))
            : encodeTicket(servedTicket)
        )
      )
    })
    const registry = AtomRegistry.make()
    const view = tagEditor(editorReq)
    const mutation = updateTagInEditor({ req: editorReq, name })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(mutation, { name: nextName })
      expect(registry.get(view)).toMatchObject({
        waiting: true,
        value: {
          applied: [{ key: name, name: nextName }],
          tags: [{ name: nextName }]
        }
      })

      servedTags = [renamed]
      servedTicket = { ...ticket, tags: [nextName] }
      finish(Response.json(encode(renamed)))

      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
      expect(registry.get(view)).toMatchObject({
        value: {
          applied: [{ key: nextName, name: nextName }],
          tags: [{ name: nextName }]
        }
      })
    } finally {
      registry.dispose()
    }
  })

  it("removes an applied tag through the editor view", async () => {
    let servedTags: ReadonlyArray<Tag> = [tag]
    let servedTicket: TicketDetail = ticket
    let finish = (_response: Response) => {}
    fetchStub.set((input, init) => {
      if (init?.method === "DELETE") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(
        Response.json(
          String(input).endsWith("/tags")
            ? servedTags.map((tag) => encode(tag))
            : encodeTicket(servedTicket)
        )
      )
    })
    const registry = AtomRegistry.make()
    const view = tagEditor(editorReq)
    const mutation = deleteTagInEditor({ req: editorReq, name })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(mutation, undefined)
      expect(registry.get(view)).toMatchObject({
        waiting: true,
        value: { applied: [], tags: [] }
      })

      servedTags = []
      servedTicket = { ...ticket, tags: [] }
      finish(new Response(null, { status: 204 }))

      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
      expect(registry.get(view)).toMatchObject({
        value: { applied: [], tags: [] }
      })
    } finally {
      registry.dispose()
    }
  })

  it("removes a deleted tag immediately", async () => {
    let served: ReadonlyArray<Tag> = [tag]
    let finish = (_response: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "DELETE") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(Response.json(served.map((tag) => encode(tag))))
    })
    const registry = AtomRegistry.make()
    const view = tagsFor(req)
    const mutation = deleteTag({ req, name })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(mutation, undefined)
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.waiting).toBe(true)
      expect(optimistic.value).toEqual([])

      served = []
      finish(new Response(null, { status: 204 }))
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value).toEqual([])
    } finally {
      registry.dispose()
    }
  })

  it("reverts a failed rename", async () => {
    let finish = (_response: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(Response.json([encode(tag)]))
    })
    const registry = AtomRegistry.make()
    const view = tagsFor(req)
    const mutation = updateTag({ req, name })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(mutation, { name: nextName })
      finish(new Response("nope", { status: 500 }))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))

      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value[0].name).toBe(name)
    } finally {
      registry.dispose()
    }
  })
})
