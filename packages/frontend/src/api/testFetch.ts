import { beforeAll, beforeEach, vi } from "vitest"

export type FetchHandler = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

const unsetHandler: FetchHandler = () =>
  Promise.reject(new Error("no fetch handler set for this test"))

/**
 * `FetchHttpClient.Fetch` memoises `globalThis.fetch` on first read, so a
 * per-test `vi.stubGlobal` is ignored after the first request in a file.
 * One dispatcher is installed for the file; tests swap the handler behind it.
 */
export const stubFetch = (): { set: (handler: FetchHandler) => void } => {
  let handler: FetchHandler = unsetHandler
  beforeAll(() => {
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      handler(input, init)
    )
  })
  beforeEach(() => {
    handler = unsetHandler
  })
  return {
    set: (next) => {
      handler = next
    }
  }
}
