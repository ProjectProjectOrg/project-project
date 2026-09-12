import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import {
  parseAttachmentUrl,
  resolveAttachmentWidthRung
} from "@projectproject/shared"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import sharp from "sharp"
import { toWebHeaders } from "./toWebHeaders"
import {
  Attachments,
  attachmentServesInline,
  deriveAttachmentEtag
} from "../Services/Attachments"
import { BetterAuth } from "../Services/BetterAuth"

const notFound = HttpServerResponse.text("Not Found", { status: 404 })

const IMMUTABLE_CACHE_CONTROL = "private, max-age=31536000, immutable"

const attempt = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => null }).pipe(
    Effect.orElseSucceed(() => null)
  )

const fetchUpstream = (url: string) => attempt(() => fetch(url))

const readBytes = (response: Response) => attempt(() => response.arrayBuffer())

const RESIZE_MAX_PIXELS = 40_000_000
const RESIZE_TIMEOUT_SECONDS = 10

const openImage = (bytes: Uint8Array, animated: boolean) =>
  sharp(bytes, {
    limitInputPixels: RESIZE_MAX_PIXELS,
    ...(animated ? { animated: true } : {})
  }).timeout({ seconds: RESIZE_TIMEOUT_SECONDS })

const readMetadata = (bytes: Uint8Array) =>
  attempt(() => openImage(bytes, false).metadata())

const resizeTo = (bytes: Uint8Array, width: number, animated: boolean) =>
  attempt(() =>
    openImage(bytes, animated)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .keepIccProfile()
      .toBuffer()
  )

const streamOriginal = (
  body: ReadableStream<Uint8Array>,
  contentType: string,
  upstreamEtag: string | null
) => {
  const etag = deriveAttachmentEtag(upstreamEtag, null)
  return HttpServerResponse.stream(
    Stream.fromReadableStream({
      evaluate: () => body,
      onError: (cause) => cause
    }),
    {
      contentType,
      headers: {
        "cache-control": IMMUTABLE_CACHE_CONTROL,
        ...(etag !== null ? { etag } : {})
      }
    }
  )
}

const proxyAttachment = Effect.fn("attachmentRoutes.proxyAttachment")(
  function* (signed: string, contentType: string, rawWidth: string | null) {
    const response = yield* fetchUpstream(signed)
    if (response === null || !response.ok || response.body === null) {
      return notFound
    }

    const upstreamEtag = response.headers.get("etag")
    const rung = resolveAttachmentWidthRung(rawWidth)

    if (rung === null) {
      return streamOriginal(response.body, contentType, upstreamEtag)
    }

    const buffer = yield* readBytes(response)
    if (buffer === null) return notFound

    const original = new Uint8Array(buffer)

    const serveOriginal = () => {
      const etag = deriveAttachmentEtag(upstreamEtag, null)
      return HttpServerResponse.uint8Array(original, {
        contentType,
        headers: {
          "cache-control": IMMUTABLE_CACHE_CONTROL,
          ...(etag !== null ? { etag } : {})
        }
      })
    }

    const metadata = yield* readMetadata(original)
    if (metadata === null) return notFound
    if (metadata.width === undefined || metadata.width <= rung) {
      return serveOriginal()
    }

    const animated = (metadata.pages ?? 1) > 1
    const resized = yield* resizeTo(original, rung, animated)
    if (resized === null) return notFound

    const etag = deriveAttachmentEtag(upstreamEtag, rung)
    return HttpServerResponse.uint8Array(new Uint8Array(resized), {
      contentType,
      headers: {
        "cache-control": IMMUTABLE_CACHE_CONTROL,
        ...(etag !== null ? { etag } : {})
      }
    })
  }
)

const serveAttachment = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const webReq = yield* HttpServerRequest.toWeb(req)
  const url = new URL(webReq.url)
  const ref = parseAttachmentUrl(url.pathname)
  if (!ref) return notFound

  const ba = yield* BetterAuth
  const session = yield* ba
    .getSession(toWebHeaders(req.headers))
    .pipe(Effect.orElseSucceed(() => null))
  if (session === null) {
    return HttpServerResponse.text("Unauthorized", { status: 401 })
  }

  const download = url.searchParams.get("download") === "1"

  const attachments = yield* Attachments
  const { url: signed, contentType } = yield* attachments.resolveForServing(
    ref.orgSlug,
    ref.id,
    session.user.id,
    { download }
  )

  if (!attachmentServesInline({ contentType, download })) {
    return HttpServerResponse.redirect(signed, {
      status: 302,
      headers: { "cache-control": "private, no-store" }
    })
  }

  return yield* proxyAttachment(signed, contentType, url.searchParams.get("w"))
}).pipe(
  Effect.catchTags({
    NotFound: () => Effect.succeed(notFound),
    Forbidden: () => Effect.succeed(notFound),
    StorageNotConnected: () => Effect.succeed(notFound),
    StorageConfigMissing: () =>
      Effect.succeed(
        HttpServerResponse.text("Storage unavailable", { status: 503 })
      ),
    StorageError: () =>
      Effect.succeed(
        HttpServerResponse.text("Storage unavailable", { status: 502 })
      )
  }),
  Effect.catchCause((cause) =>
    Effect.andThen(
      Effect.logError("attachment route failure", cause),
      Effect.succeed(
        HttpServerResponse.text("Attachment failed", { status: 500 })
      )
    )
  )
)

export const attachmentRoutes = serveAttachment
