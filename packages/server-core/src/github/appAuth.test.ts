import { it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import { afterEach, describe, expect, vi } from "vitest"

import { appAuth, fetchWithTimeout } from "./appAuth"
import { GITHUB_REQUEST_TIMEOUT } from "./request"

const config = ConfigProvider.fromUnknown({
  GITHUB_APP_ID: "123",
  GITHUB_APP_PRIVATE_KEY:
    "-----BEGIN RSA PRIVATE KEY-----\\nfake\\n-----END RSA PRIVATE KEY-----",
  GITHUB_APP_CLIENT_ID: "client-id",
  GITHUB_APP_CLIENT_SECRET: "client-secret"
})

describe("appAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.effect(
    "aborts OAuth token exchange at the shared GitHub request deadline",
    () =>
      Effect.gen(function* () {
        const timeout = new AbortController()
        const timeoutSpy = vi
          .spyOn(AbortSignal, "timeout")
          .mockReturnValue(timeout.signal)
        let signal: AbortSignal | undefined
        const fetchMock = Object.assign(
          vi.fn(
            (
              _input: string | URL | Request,
              init?: RequestInit
            ): Promise<Response> => {
              signal = init?.signal ?? undefined
              return new Promise<Response>((_resolve, reject) => {
                signal?.addEventListener(
                  "abort",
                  () =>
                    reject(
                      new DOMException(
                        "The operation was aborted",
                        "AbortError"
                      )
                    ),
                  { once: true }
                )
              })
            }
          ),
          { preconnect: vi.fn() }
        )
        vi.stubGlobal("fetch", fetchMock)

        const auth = yield* appAuth().pipe(
          Effect.provideService(ConfigProvider.ConfigProvider, config),
          Effect.provideService(FetchHttpClient.Fetch, fetchMock)
        )
        const exchange = auth({ type: "oauth-user", code: "code" })

        yield* Effect.promise(() =>
          vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
        )
        timeout.abort()

        yield* Effect.promise(() =>
          expect(exchange).rejects.toMatchObject({
            name: "AbortError",
            status: 500
          })
        )
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(signal?.aborted).toBe(true)
        expect(timeoutSpy).toHaveBeenCalledWith(
          Duration.toMillis(GITHUB_REQUEST_TIMEOUT)
        )
      })
  )

  it("merges a caller signal with the shared deadline", async () => {
    const timeout = new AbortController()
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal)
    const caller = new AbortController()
    let signal: AbortSignal | undefined
    const fetchMock = Object.assign(
      vi.fn(
        (
          _input: string | URL | Request,
          init?: RequestInit
        ): Promise<Response> => {
          signal = init?.signal ?? undefined
          return Promise.resolve(new Response())
        }
      ),
      { preconnect: vi.fn() }
    )
    vi.stubGlobal("fetch", fetchMock)

    await fetchWithTimeout(fetchMock, "https://github.test", {
      signal: caller.signal
    })
    caller.abort()

    expect(signal?.aborted).toBe(true)
    expect(signal).not.toBe(caller.signal)
  })
})
