import { createAppAuth } from "@octokit/auth-app"
import { GitHubError } from "@pp/shared"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import { Octokit } from "octokit"

import { GITHUB_REQUEST_TIMEOUT } from "./request"

export type GitHubAppAuth = ReturnType<typeof createAppAuth>

const Fetch = FetchHttpClient.Fetch as Context.Key<
  never,
  typeof globalThis.fetch
>

export const fetchWithTimeout = (
  fetch: typeof globalThis.fetch,
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> => {
  const timeoutSignal = AbortSignal.timeout(
    Duration.toMillis(GITHUB_REQUEST_TIMEOUT)
  )
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal
  return fetch(input, { ...init, signal })
}

const normalizePrivateKey = (raw: string): string => {
  const normalized = raw.replace(/\\n/g, "\n")
  if (normalized.includes("BEGIN")) return normalized
  return Buffer.from(normalized, "base64").toString("utf8")
}

export const appAuth = (): Effect.Effect<GitHubAppAuth, GitHubError> =>
  Effect.gen(function* () {
    const fetch = yield* Effect.service(Fetch)
    const appId = yield* Config.String("GITHUB_APP_ID")
    const privateKey = yield* Config.Redacted("GITHUB_APP_PRIVATE_KEY")
    const clientId = yield* Config.String("GITHUB_APP_CLIENT_ID")
    const clientSecret = yield* Config.Redacted("GITHUB_APP_CLIENT_SECRET")
    const githubAuthRequest = new Octokit({
      retry: { enabled: false }
    }).request.defaults({
      request: {
        fetch: (input: string | URL | Request, init?: RequestInit) =>
          fetchWithTimeout(fetch, input, init)
      }
    })
    return yield* Effect.try({
      try: () =>
        createAppAuth({
          appId,
          privateKey: normalizePrivateKey(Redacted.value(privateKey)),
          clientId,
          clientSecret: Redacted.value(clientSecret),
          request: githubAuthRequest
        }),
      catch: (cause) => new GitHubError({ message: String(cause) })
    })
  }).pipe(
    Effect.catch((cause) =>
      cause._tag === "GitHubError"
        ? Effect.fail(cause)
        : Effect.fail(
            new GitHubError({
              message: "missing GitHub App configuration"
            })
          )
    )
  )
