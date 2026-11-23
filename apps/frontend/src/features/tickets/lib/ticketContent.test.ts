import { expect, it } from "vitest"

import { rememberPreloaded } from "./ticketContent"

it("forgets the least recently filled tickets beyond the limit", () => {
  const preloaded = new Map<string, string>()
  rememberPreloaded(preloaded, "T-1", "keys-1", 2)
  rememberPreloaded(preloaded, "T-2", "keys-2", 2)
  rememberPreloaded(preloaded, "T-1", "keys-1", 2)
  const evicted = rememberPreloaded(preloaded, "T-3", "keys-3", 2)
  expect(evicted).toEqual(["keys-2"])
  expect([...preloaded.keys()]).toEqual(["T-1", "T-3"])
})
