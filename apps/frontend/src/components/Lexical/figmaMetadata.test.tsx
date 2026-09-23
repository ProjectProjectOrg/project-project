import { TicketId, type FigmaRef } from "@pp/shared"
import { act, cleanup, render } from "@testing-library/react"
import * as Schema from "effect/Schema"
import { afterEach, describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { figmaTicketLinksRequest } from "@/features/figma/atoms/figma"

import { FigmaChip } from "./FigmaChip"

const makeTicketId = Schema.decodeSync(TicketId)
const fetchStub = stubFetch()

const REF: FigmaRef = {
  kind: "design",
  fileKey: "abc123",
  nodeId: null,
  slug: "checkout"
}

afterEach(() => {
  cleanup()
})

describe("Figma metadata", () => {
  it("does not throw when the ticket target resolves from null to non-null", () => {
    fetchStub.set(() => Promise.resolve(Response.json([])))
    const { rerender } = render(
      <FigmaChip
        request={null}
        reference={REF}
        label="Checkout"
        morphId="figma-test"
      />
    )

    const request = figmaTicketLinksRequest(
      "acme",
      "proj",
      makeTicketId("AB-1")
    )

    expect(() =>
      rerender(
        <FigmaChip
          request={request}
          reference={REF}
          label="Checkout"
          morphId="figma-test"
        />
      )
    ).not.toThrow()
  })

  it("stops polling after fifteen visible attempts", async () => {
    vi.useFakeTimers()
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible")
    let requests = 0
    fetchStub.set(() => {
      requests += 1
      return Promise.resolve(Response.json([]))
    })
    const request = figmaTicketLinksRequest(
      "acme",
      "proj",
      makeTicketId("AB-1")
    )

    try {
      render(
        <FigmaChip
          request={request}
          reference={REF}
          label="Checkout"
          morphId="figma-test"
        />
      )
      await act(() => vi.advanceTimersByTimeAsync(20_000))
      const requestsAtLimit = requests
      await act(() => document.dispatchEvent(new Event("visibilitychange")))
      await act(() => vi.advanceTimersByTimeAsync(5_000))
      expect(requests).toBe(requestsAtLimit)
    } finally {
      visibility.mockRestore()
      vi.useRealTimers()
    }
  })
})
