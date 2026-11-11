import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

import { Db } from "@pp/db"
import { linkPreview } from "@pp/db/schema"
import type { LinkPreview } from "@pp/shared"
import { eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"

import { faviconRendering } from "./faviconRendering"
import {
  defaultFaviconUrl,
  parsePageMetadata,
  type PageMetadata
} from "./pageMetadata"
import { isPublicAddress } from "./publicAddress"

export class LinkPreviews extends Context.Service<
  LinkPreviews,
  Readonly<{
    get: (url: string) => Effect.Effect<LinkPreview>
  }>
>()("@pp/server-core/linkPreviews/LinkPreviews") {}

const Fetch = FetchHttpClient.Fetch as Context.Key<
  never,
  typeof globalThis.fetch
>

const DAY_MS = 24 * 60 * 60 * 1000
const FRESH_MS = 7 * DAY_MS
const RETRY_MS = DAY_MS
const FETCH_TIMEOUT = "5 seconds"
const MAX_REDIRECTS = 5
const MAX_ICON_BYTES = 256 * 1024
const MAX_HTML_BYTES = 1024 * 1024
const USER_AGENT = "Mozilla/5.0 (compatible; ProjectProject link preview)"
const PRIVATE_HOST_SUFFIX = /\.(localhost|local|internal|lan|home|corp)$/i

const UNAVAILABLE: PageMetadata = { title: null, faviconUrl: null }

export const previewTarget = (raw: string, base?: URL): URL | null => {
  let url: URL
  try {
    url = new URL(raw.trim(), base)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (url.username !== "" || url.password !== "") return null
  if (url.port !== "") return null
  url.hash = ""
  return url
}

const isPublicHost = (url: URL): Effect.Effect<boolean> => {
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (isIP(host) !== 0) return Effect.succeed(isPublicAddress(host))
  if (!host.includes(".") || PRIVATE_HOST_SUFFIX.test(host)) {
    return Effect.succeed(false)
  }
  return Effect.tryPromise(() =>
    lookup(host, { all: true, verbatim: true })
  ).pipe(
    Effect.map(
      (addresses) =>
        addresses.length > 0 &&
        addresses.every((entry) => isPublicAddress(entry.address))
    ),
    Effect.orElseSucceed(() => false)
  )
}

const decoderFor = (contentType: string): TextDecoder => {
  const label = /charset=["']?([^;"'\s]+)/i.exec(contentType)?.[1] ?? "utf-8"
  try {
    const decoder: unknown = Reflect.construct(TextDecoder, [label])
    return decoder instanceof TextDecoder ? decoder : new TextDecoder()
  } catch {
    return new TextDecoder()
  }
}

const HEAD_END = /<\/head\s*>|<body\b/i
const HEAD_END_OVERLAP = 16

const readHtmlHead = (response: Response) =>
  Effect.tryPromise(async () => {
    const reader = response.body?.getReader()
    if (reader === undefined) return ""
    const decoder = decoderFor(response.headers.get("content-type") ?? "")
    let html = ""
    let size = 0
    try {
      while (size < MAX_HTML_BYTES) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = value.subarray(0, MAX_HTML_BYTES - size)
        size += chunk.byteLength
        const scanFrom = Math.max(0, html.length - HEAD_END_OVERLAP)
        html += decoder.decode(chunk, { stream: true })
        if (HEAD_END.test(html.slice(scanFrom))) break
      }
    } finally {
      await reader.cancel().catch(() => undefined)
    }
    return html
  })

const discardBody = (response: Response) =>
  Effect.promise(
    () => response.body?.cancel().catch(() => undefined) ?? Promise.resolve()
  )

const isHtml = (response: Response): boolean =>
  /\b(text\/html|application\/xhtml\+xml)\b/i.test(
    response.headers.get("content-type") ?? ""
  )

const fetchPublicResponse = Effect.fnUntraced(function* (
  start: URL,
  accept: string
) {
  const fetch = yield* Effect.service(Fetch)
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(yield* isPublicHost(url))) return null
    const response = yield* Effect.tryPromise((signal) =>
      fetch(url.href, {
        redirect: "manual",
        signal,
        headers: { "user-agent": USER_AGENT, accept }
      })
    )
    const location = response.headers.get("location")
    if (response.status >= 300 && response.status < 400 && location !== null) {
      yield* discardBody(response)
      const next = previewTarget(location, url)
      if (next === null) return null
      url = next
      continue
    }
    return { response, url }
  }
  return null
})

const fetchPageMetadata = Effect.fnUntraced(function* (start: URL) {
  const result = yield* fetchPublicResponse(
    start,
    "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1"
  )
  if (result === null) return UNAVAILABLE
  const { response, url } = result
  if (!response.ok || !isHtml(response)) {
    yield* discardBody(response)
    return { title: null, faviconUrl: defaultFaviconUrl(url) }
  }
  const html = yield* readHtmlHead(response)
  return parsePageMetadata(html, url)
})

const readIcon = (response: Response) =>
  Effect.tryPromise(async (signal) => {
    const reader = response.body?.getReader()
    if (reader === undefined) return null
    const cancel = () => {
      void reader.cancel().catch(() => undefined)
    }
    signal.addEventListener("abort", cancel, { once: true })
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_ICON_BYTES) return null
        chunks.push(value)
      }
    } finally {
      signal.removeEventListener("abort", cancel)
      await reader.cancel().catch(() => undefined)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  })

const resolveFaviconRendering = Effect.fnUntraced(
  function* (
    src: string | null
  ): Effect.fn.Return<LinkPreview["faviconRendering"], unknown> {
    const target = src === null ? null : previewTarget(src)
    if (target === null) return "original"
    const result = yield* fetchPublicResponse(target, "image/*")
    if (result === null) return "original"
    if (!result.response.ok) {
      yield* discardBody(result.response)
      return "original"
    }
    const bytes = yield* readIcon(result.response)
    return bytes === null
      ? "original"
      : yield* Effect.promise(() => faviconRendering(bytes))
  },
  Effect.timeout(FETCH_TIMEOUT),
  Effect.orElseSucceed((): LinkPreview["faviconRendering"] => "original")
)

const resolvePageMetadata = (target: URL): Effect.Effect<PageMetadata> =>
  fetchPageMetadata(target).pipe(
    Effect.timeout(FETCH_TIMEOUT),
    Effect.orElseSucceed(() => ({
      title: null,
      faviconUrl: defaultFaviconUrl(target)
    }))
  )

const make = Effect.gen(function* () {
  const db = yield* Db

  const cached = (url: string) =>
    db
      .select()
      .from(linkPreview)
      .where(eq(linkPreview.url, url))
      .limit(1)
      .pipe(
        Effect.map((rows) => rows[0] ?? null),
        Effect.orElseSucceed(() => null)
      )

  const store = (row: typeof linkPreview.$inferInsert) =>
    db
      .insert(linkPreview)
      .values(row)
      .onConflictDoUpdate({
        target: linkPreview.url,
        set: {
          title: row.title,
          faviconUrl: row.faviconUrl,
          faviconRendering: row.faviconRendering,
          fetchedAt: row.fetchedAt
        }
      })
      .pipe(Effect.ignore)

  const get = Effect.fn("LinkPreviews.get")(function* (
    raw: string
  ): Effect.fn.Return<LinkPreview> {
    const target = previewTarget(raw)
    if (target === null)
      return { url: raw, ...UNAVAILABLE, faviconRendering: "original" }
    const url = target.href
    const now = yield* DateTime.nowAsDate
    const row = yield* cached(url)
    if (row !== null) {
      const maxAge = row.title === null ? RETRY_MS : FRESH_MS
      if (now.getTime() - row.fetchedAt.getTime() < maxAge) {
        const rendering =
          row.faviconRendering ??
          (yield* resolveFaviconRendering(row.faviconUrl))
        if (row.faviconRendering === null)
          yield* store({ ...row, faviconRendering: rendering })
        return {
          url,
          title: row.title,
          faviconUrl: row.faviconUrl,
          faviconRendering: rendering
        }
      }
    }
    const metadata = yield* resolvePageMetadata(target)
    const rendering = yield* resolveFaviconRendering(metadata.faviconUrl)
    yield* store({
      url,
      ...metadata,
      faviconRendering: rendering,
      fetchedAt: now
    })
    return { url, ...metadata, faviconRendering: rendering }
  })

  return LinkPreviews.of({ get })
})

export const layer = Layer.effect(LinkPreviews, make)
