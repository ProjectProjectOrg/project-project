import { cleanup, render } from "@testing-library/react"
import * as Schema from "effect/Schema"
import { afterEach, describe, expect, it } from "vite-plus/test"
import { TicketId, type FigmaRef } from "@projectproject/shared"
import { stubFetch } from "@/api/testFetch"
import { figmaTicketLinksRequest } from "@/atoms/figma"
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
})
