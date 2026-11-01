import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

import type { WebhookHeader } from "@pp/shared"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"

import { isPublicAddress } from "./addresses"
import { parseRetryAfter, type AttemptResult } from "./policy"
import { sign, signatureHeader } from "./signature"

export const reservedHeaders: ReadonlySet<string> = new Set([
  "host",
  "content-type",
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "te",
  "trailer",
  "proxy-authorization",
  "user-agent"
])

export const isReservedHeader = (name: string) => {
  const lower = name.toLowerCase()
  return reservedHeaders.has(lower) || lower.startsWith("x-pp-")
}

export const allowPrivateNetworks = Config.Boolean(
  "WEBHOOKS_ALLOW_PRIVATE_NETWORKS"
).pipe(Config.withDefault(false))

export type Target = Readonly<{
  url: string
  secret: string
  headers: ReadonlyArray<WebhookHeader>
}>

export type Delivery = Readonly<{
  id: string
  event: string
  body: string
  createdAt: Date
}>

export type UrlProblem =
  | "invalid_url"
  | "insecure_scheme"
  | "credentials_in_url"
  | "blocked_address"
  | "unresolvable"

const timeoutMs = 10_000
const excerptBytes = 64 * 1024
const storedExcerptChars = 1024

const parseTarget = (raw: string, allowPrivate: boolean): URL | UrlProblem => {
  if (!URL.canParse(raw)) return "invalid_url"
  const url = new URL(raw)
  if (url.protocol !== "https:" && !(allowPrivate && url.protocol === "http:"))
    return "insecure_scheme"
  if (url.username !== "" || url.password !== "") return "credentials_in_url"
  if (url.hostname === "") return "invalid_url"
  return url
}

const bareHost = (url: URL) => url.hostname.replace(/^\[(.*)\]$/u, "$1")

const resolveAddresses = (url: URL) => {
  const host = bareHost(url)
  return isIP(host) !== 0
    ? Effect.succeed([host])
    : Effect.tryPromise({
        try: () => lookup(host, { all: true, verbatim: true }),
        catch: () => "unresolvable" as const
      }).pipe(Effect.map((answers) => answers.map((answer) => answer.address)))
}

const redact = (text: string, secrets: ReadonlyArray<string>) =>
  secrets
    .filter((value) => value.length >= 6)
    .toSorted((a, b) => b.length - a.length)
    .reduce((acc, value) => acc.split(value).join("[redacted]"), text)

const isPrintable = (code: number) =>
  code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)

const withoutControlCharacters = (text: string) =>
  Array.from(text, (character) =>
    isPrintable(character.codePointAt(0) ?? 0) ? character : ""
  ).join("")

const urlSecrets = (url: URL) =>
  [
    ...url.pathname.split("/"),
    ...url.searchParams.values(),
    url.search.slice(1)
  ].filter((part) => part.length >= 8)

const readExcerpt = (stream: Stream.Stream<Uint8Array, unknown>) => {
  let total = 0
  return stream.pipe(
    Stream.takeUntil((chunk) => (total += chunk.byteLength) >= excerptBytes),
    Stream.runCollect,
    Effect.map((chunks) => {
      const bytes = new Uint8Array(Math.min(total, excerptBytes))
      let offset = 0
      for (const chunk of chunks) {
        const slice = chunk.subarray(0, bytes.byteLength - offset)
        bytes.set(slice, offset)
        offset += slice.byteLength
      }
      return new TextDecoder().decode(bytes)
    }),
    Effect.catch(() => Effect.succeed(""))
  )
}

const failureReason = (error: unknown): AttemptResult => {
  const cause = (error as { reason?: { cause?: unknown } } | null)?.reason
    ?.cause
  const text = String(
    (cause as { code?: unknown } | null)?.code ?? cause ?? error
  ).toUpperCase()
  return {
    _tag: "Failure",
    reason:
      text.includes("CERT") || text.includes("TLS") || text.includes("SSL")
        ? "tls"
        : "connection"
  }
}

export class WebhookSender extends Context.Service<
  WebhookSender,
  Readonly<{
    check: (url: string) => Effect.Effect<UrlProblem | null>
    send: (target: Target, delivery: Delivery) => Effect.Effect<AttemptResult>
  }>
>()("@pp/webhooks/Sender/WebhookSender") {}

const make = Effect.gen(function* () {
  const allowPrivate = yield* allowPrivateNetworks
  const client = yield* HttpClient.HttpClient
  const pick = Effect.fn("WebhookSender.resolve")(function* (url: URL) {
    const addresses = yield* resolveAddresses(url)
    if (addresses.length === 0)
      return yield* Effect.fail("unresolvable" as const)
    if (!allowPrivate && addresses.some((address) => !isPublicAddress(address)))
      return yield* Effect.fail("blocked_address" as const)
    return addresses[0] as string
  })

  const check = Effect.fn("WebhookSender.check")(function* (raw: string) {
    const url = parseTarget(raw, allowPrivate)
    if (typeof url === "string") return url
    return yield* pick(url).pipe(
      Effect.as(null),
      Effect.catch((problem) => Effect.succeed(problem))
    )
  })

  const attempt = (target: Target, delivery: Delivery) =>
    Effect.gen(function* () {
      const url = parseTarget(target.url, allowPrivate)
      if (typeof url === "string")
        return {
          _tag: "Failure",
          reason: url === "blocked_address" ? url : "invalid_url"
        } satisfies AttemptResult
      const address = yield* pick(url).pipe(Effect.result)
      if (address._tag === "Failure")
        return {
          _tag: "Failure",
          reason:
            address.failure === "blocked_address" ? "blocked_address" : "dns"
        } satisfies AttemptResult
      const pinned = new URL(url)
      pinned.hostname =
        isIP(address.success) === 6 ? `[${address.success}]` : address.success
      const headers: Record<string, string> = {}
      for (const header of target.headers)
        if (!isReservedHeader(header.name))
          headers[header.name.toLowerCase()] = header.value
      const request = HttpClientRequest.post(pinned).pipe(
        HttpClientRequest.bodyText(delivery.body, "application/json"),
        HttpClientRequest.setHeaders({
          ...headers,
          host: url.host,
          "user-agent": "ProjectProject-Webhooks/1",
          "x-pp-event": delivery.event,
          "x-pp-delivery": delivery.id,
          "x-pp-timestamp": DateTime.formatIso(
            DateTime.fromDateUnsafe(delivery.createdAt)
          ),
          [signatureHeader]: sign(target.secret, delivery.body)
        })
      )
      const secrets = [
        target.secret,
        ...target.headers.flatMap((header) => [
          header.value,
          ...header.value.split(/\s+/u)
        ]),
        ...urlSecrets(url)
      ]
      const init: BunFetchRequestInit = {
        redirect: "manual",
        proxy: false,
        tls: { serverName: bareHost(url) }
      }
      return yield* Effect.gen(function* () {
        const response = yield* client.execute(request)
        const text = yield* readExcerpt(response.stream)
        const excerpt = withoutControlCharacters(redact(text, secrets)).slice(
          0,
          storedExcerptChars
        )
        return {
          _tag: "Response",
          status: response.status,
          retryAfterSeconds: parseRetryAfter(
            response.headers["retry-after"] ?? null,
            yield* DateTime.nowAsDate
          ),
          excerpt: excerpt === "" ? null : excerpt
        } satisfies AttemptResult
      }).pipe(
        Effect.scoped,
        Effect.provideService(FetchHttpClient.RequestInit, init),
        Effect.catch((error) => Effect.succeed(failureReason(error)))
      )
    }).pipe(
      Effect.timeoutOrElse({
        duration: timeoutMs,
        orElse: () =>
          Effect.succeed({
            _tag: "Failure",
            reason: "timeout"
          } satisfies AttemptResult)
      })
    )

  const send = Effect.fn("WebhookSender.send")(
    (target: Target, delivery: Delivery) =>
      attempt(target, delivery).pipe(
        Effect.withSpan("WebhookSender.attempt", {
          attributes: { "webhook.event": delivery.event }
        })
      )
  )

  return WebhookSender.of({ check, send })
})

export const layer = Layer.effect(WebhookSender, make).pipe(
  Layer.provide(FetchHttpClient.layer)
)
