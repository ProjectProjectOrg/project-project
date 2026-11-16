import { describe, expect, it } from "vitest"

import { listEndpointOf } from "./listRequests"

describe("listEndpointOf", () => {
  it("names the ticket list endpoints a local copy replaces", () => {
    const base = "/api/orgs/acme/projects/web/tickets"
    expect(
      [
        `${base}/sections`,
        `${base}/sprint-sections`,
        `${base}/T-12/sequence`,
        `${base}/T-12`,
        `${base}/bulk`,
        "/api/orgs/acme/projects/web/sync"
      ].map(listEndpointOf)
    ).toEqual(["sections", "sprint-sections", "sequence", null, null, null])
  })
})
