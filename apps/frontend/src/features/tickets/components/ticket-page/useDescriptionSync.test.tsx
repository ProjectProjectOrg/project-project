import { RegistryContext } from "@effect/atom-react"
import {
  TicketDetail,
  TicketId,
  TicketStatus,
  TicketUpdateResult,
  UpdateTicketPayload,
  Validation
} from "@pp/shared"
import { act, cleanup, renderHook } from "@testing-library/react"
import * as DateTime from "effect/DateTime"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import type { LexicalEditor } from "lexical"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { MARKDOWN_TRANSFORMERS } from "@/features/editor/components/LexicalEditor"
import {
  ticketBodyDraft,
  type TicketBodyDraft,
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"

import { useDescriptionSync } from "./useDescriptionSync"

const ticket = {
  id: Schema.decodeSync(TicketId)("T-1"),
  title: "Title",
  status: Schema.decodeSync(TicketStatus)("todo"),
  type: "chore",
  priority: "med",
  estimate: null,
  tags: [],
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
  creator: null,
  updater: null,
  body: "Loaded"
} satisfies TicketDetail

const encodeDetail = Schema.encodeSync(TicketDetail)
const encodeUpdate = Schema.encodeSync(TicketUpdateResult)
const encodeValidation = Schema.encodeSync(Validation)
const req = ticketRequest("acme", "web", ticket.id)
const fetchStub = stubFetch()

type Patch = UpdateTicketPayload
const decodePatch = Schema.decodeUnknownSync(UpdateTicketPayload)

const serve = (onPatch: (patch: Patch) => Response) => {
  const patches: Array<Patch> = []
  const gets = vi.fn<() => void>()
  fetchStub.set(async (_input, init) => {
    if (init?.method === "PATCH") {
      const patch = decodePatch(await new Response(init.body).json())
      patches.push(patch)
      return onPatch(patch)
    }
    gets()
    return Response.json(encodeDetail(ticket))
  })
  return { patches, gets }
}

const saved = (patch: Patch) =>
  Response.json(
    encodeUpdate({
      ticket: { ...ticket, body: patch.body ?? ticket.body },
      orderKey: null
    })
  )

const setup = (focused: boolean, draft: TicketBodyDraft | null = null) => {
  const registry = AtomRegistry.make()
  registry.mount(ticketDetail(req))
  registry.mount(ticketBodyDraft(req))
  registry.set(ticketBodyDraft(req), draft)
  const editorRef = { current: null as LexicalEditor | null }
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
    <RegistryContext.Provider value={registry}>
      {children}
    </RegistryContext.Provider>
  )
  const hook = renderHook(
    ({ body, focused }: Readonly<{ body: string; focused: boolean }>) =>
      useDescriptionSync({
        req,
        body,
        editorRef,
        transformers: MARKDOWN_TRANSFORMERS,
        focused
      }),
    { wrapper, initialProps: { body: ticket.body, focused } }
  )
  return { ...hook, registry }
}

afterEach(() => cleanup())

describe("useDescriptionSync", () => {
  it("saves against the body it started from and moves the base to what the server confirmed", async () => {
    const { patches } = serve(saved)
    const { result } = setup(true)

    await act(() => result.current.save("First", 0))
    await act(() => result.current.save("Second", 0))

    expect(patches).toEqual([
      { body: "First", expectedBody: "Loaded" },
      { body: "Second", expectedBody: "First" }
    ])
  })

  it("flags a remote change while editing, and drops the replaced editor's late save after taking theirs", async () => {
    const { patches } = serve(saved)
    const { result, rerender } = setup(true)

    rerender({ body: "Agent wrote this", focused: true })
    expect(result.current.stale).toBe("Agent wrote this")

    act(() => result.current.takeTheirs())
    expect(result.current).toMatchObject({ stale: null, revision: 1 })

    await act(() => result.current.save("Stale draft", 0))
    await act(() => result.current.save("Fresh edit", 1))
    expect(patches).toEqual([
      { body: "Fresh edit", expectedBody: "Agent wrote this" }
    ])
  })

  it("starts a fresh editor revision when the body changes under an idle editor", () => {
    serve(saved)
    const { result, rerender } = setup(false)

    rerender({ body: "Agent wrote this", focused: false })

    expect(result.current).toMatchObject({ stale: null, revision: 1 })
  })

  it("restores a draft against the base it was written on, and flags the change made since", async () => {
    const { patches } = serve(saved)
    const { result } = setup(false, { body: "My draft", base: "Older" })

    expect(result.current.stale).toBe("Loaded")
    await act(() => result.current.save("My draft, continued", 0))
    expect(patches).toEqual([
      { body: "My draft, continued", expectedBody: "Older" }
    ])
  })

  it("rejects a save the server says was made against an outdated body and refetches the ticket", async () => {
    const { gets } = serve(() =>
      Response.json(
        encodeValidation(new Validation({ reason: "ticket_body_changed" })),
        { status: 400 }
      )
    )
    const { result } = setup(true)
    await vi.waitFor(() => expect(gets).toHaveBeenCalledTimes(1))

    await expect(
      act(() => result.current.save("Mine", 0))
    ).rejects.toMatchObject({ reason: "ticket_body_changed" })
    await vi.waitFor(() => expect(gets).toHaveBeenCalledTimes(2))
  })
})
