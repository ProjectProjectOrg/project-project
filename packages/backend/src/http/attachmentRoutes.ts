import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { parseAttachmentUrl } from "@projectproject/shared"
import * as Effect from "effect/Effect"
import sharp from "sharp"
import { toWebHeaders } from "./toWebHeaders"
import {
  Attachments,
  attachmentServesInline,
  deriveAttachmentEtag,
  resolveAttachmentWidthRung
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

const readMetadata = (bytes: Uint8Array) =>
  attempt(() => sharp(bytes).metadata())

const resizeTo = (bytes: Uint8Array, width: number) =>
  attempt(() =>
    sharp(bytes).resize({ width, withoutEnlargement: true }).toBuffer()
  )

const proxyAttachment = Effect.fn("attachmentRoutes.proxyAttachment")(
  function* (signed: string, contentType: string, rawWidth: string | null) {
    const response = yield* fetchUpstream(signed)
    if (response === null || !response.ok || response.body === null) {
      return notFound
    }

    const buffer = yield* readBytes(response)
    if (buffer === null) return notFound

    const original = new Uint8Array(buffer)
    const upstreamEtag = response.headers.get("etag")
    const rung = resolveAttachmentWidthRung(rawWidth)

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

    if (rung === null) return serveOriginal()

    const metadata = yield* readMetadata(original)
    if (metadata === null) return notFound
    if (metadata.width === undefined || metadata.width <= rung) {
      return serveOriginal()
    }

    const resized = yield* resizeTo(original, rung)
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
