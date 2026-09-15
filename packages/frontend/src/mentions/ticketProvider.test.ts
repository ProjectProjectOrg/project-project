import * as Effect from "effect/Effect"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { expect, it, vi } from "vitest"
import { stubFetch } from "@/api/testFetch"
import { ticketProvider } from "./ticketProvider"

const fetchStub = stubFetch()

it("deduplicates identical ticket mention searches", async () => {
  const fetch = vi.fn(() =>
    Promise.resolve(
      Response.json([
        {
          id: "WEB-1",
          title: "Native atom search",
          status: "todo",
          type: "feat",
          priority: "med",
          tags: [],
          branch: null,
          pr: null,
          prState: null,
          lastTransitionedPr: null,
          gitState: { tag: "no_branch" },
          assignees: [],
          archivedAt: null,
          createdBy: "user-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ])
    )
  )
  fetchStub.set(fetch)
  const registry = Registry.make()
  const provider = ticketProvider({ orgSlug: "acme", slug: "web" })
  const search = () =>
    Effect.runPromise(
      provider
        .search("native")
        .pipe(Effect.provideService(Registry.AtomRegistry, registry))
    )

  try {
    const [first, second] = await Promise.all([search(), search()])
    expect(first).toEqual([{ id: "WEB-1", label: "Native atom search" }])
    expect(second).toEqual(first)
    expect(fetch).toHaveBeenCalledOnce()
  } finally {
    registry.dispose()
  }
})
