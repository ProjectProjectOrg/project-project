import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"
import { stubFetch } from "@/api/testFetch"
import {
  oauthApplicationsAtom,
  oauthApplicationsRequest
} from "./oauthApplications"
import {
  oauthClientNameAtom,
  oauthClientRequest,
  oauthConsentRequest,
  submitConsentAtom
} from "./oauthConsent"

const fetchStub = stubFetch()

const requestUrl = (input: RequestInfo | URL): URL =>
  new URL(
    input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.href
        : input,
    "http://localhost"
  )

describe("OAuth consent", () => {
  it("does not request client metadata when client_id is absent", () => {
    const fetch = vi.fn(() => Promise.reject(new Error("unexpected request")))
    fetchStub.set(fetch)
    const registry = AtomRegistry.make()
    const client = oauthClientNameAtom(oauthClientRequest(undefined))
    registry.mount(client)

    try {
      const result = registry.get(client)
      expect(AsyncResult.isSuccess(result)).toBe(true)
      if (AsyncResult.isSuccess(result)) {
        expect(result.value).toEqual({ name: null })
      }
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      registry.dispose()
    }
  })

  it("refreshes connected applications after accepted consent", async () => {
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)
      const method = input instanceof Request ? input.method : init?.method
      if (url.pathname.endsWith("/consent") && method === "POST") {
        return Promise.resolve(Response.json({ redirectURI: "/connected" }))
      }
      return Promise.resolve(Response.json([]))
    })
    fetchStub.set(fetch)
    const registry = AtomRegistry.make()
    const applications = oauthApplicationsAtom(oauthApplicationsRequest())
    const consent = submitConsentAtom(oauthConsentRequest("client_id=client"))
    registry.mount(applications)
    registry.mount(consent)

    try {
      await vi.waitFor(() => {
        const result = registry.get(applications)
        expect(AsyncResult.isSuccess(result)).toBe(true)
        expect(result.waiting).toBe(false)
      })
      expect(fetch).toHaveBeenCalledTimes(1)

      registry.set(consent, { accept: true })

      await vi.waitFor(() => expect(registry.get(consent).waiting).toBe(false))
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
      expect(
        fetch.mock.calls.filter(([input]) => {
          const url = requestUrl(input)
          return url.pathname.endsWith("/oauth-applications")
        })
      ).toHaveLength(2)
    } finally {
      registry.dispose()
    }
  })
})
