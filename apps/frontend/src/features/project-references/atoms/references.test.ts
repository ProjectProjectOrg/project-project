import {
  FixReferenceAction,
  type ReferenceToFix,
  TicketChanged
} from "@pp/shared"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import { expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import { fixReference, referencesRequest, referencesToFix } from "./references"

const fetch = stubFetch()
const first = {
  ticketId: "PP-1",
  kind: "user",
  target: "old-user",
  label: "Ada",
  snippet: "Ask Ada"
} satisfies ReferenceToFix
const second = { ...first, ticketId: "PP-2" }

it("refreshes references after a fix fails partway through several tickets", async () => {
  let served = [first, second]
  let finish: ((response: Response) => void) | undefined
  fetch.set((_input, init) =>
    init?.method === "POST"
      ? new Promise<Response>((resolve) => {
          finish = resolve
        })
      : Promise.resolve(Response.json({ items: served }))
  )
  const registry = AtomRegistry.make()
  const req = referencesRequest("acme", "project")
  const view = referencesToFix(req)
  const mutation = fixReference({ req, kind: "user", target: first.target })
  registry.mount(view)
  registry.mount(mutation)
  try {
    await vi.waitFor(() =>
      expect(registry.get(view)).toMatchObject({
        _tag: "Success",
        value: { items: [first, second] }
      })
    )
    registry.set(mutation, {
      kind: "user",
      target: first.target,
      ticketId: null,
      action: FixReferenceAction.cases.plain.make({})
    })
    await vi.waitFor(() =>
      expect(registry.get(view)).toMatchObject({
        _tag: "Success",
        waiting: true,
        value: { items: [] }
      })
    )
    served = [second]
    if (finish === undefined) throw new Error("Fix request did not start")
    finish(
      Response.json(new TicketChanged({ kind: "updated_since_read" }), {
        status: 409
      })
    )
    await vi.waitFor(() =>
      expect(registry.get(mutation)).toMatchObject({ _tag: "Failure" })
    )
    await vi.waitFor(() =>
      expect(registry.get(view)).toMatchObject({
        _tag: "Success",
        waiting: false,
        value: { items: [second] }
      })
    )
  } finally {
    registry.dispose()
  }
})
