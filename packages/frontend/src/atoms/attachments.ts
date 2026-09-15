import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import {
  AttachmentId,
  ATTACHMENT_PAGE_SIZE,
  type AttachmentListPage,
  type AttachmentSort,
  type AttachmentStatus,
  type AttachmentSummary,
  type TicketId
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"

export class AttachmentUploadFailed extends Data.TaggedError(
  "AttachmentUploadFailed"
)<{
  readonly reason: "status" | "network" | "abort"
  readonly status?: number
}> {}

export interface UploadAttachmentInput {
  readonly file: File
  readonly signal?: AbortSignal
  readonly onProgress?: (fraction: number) => void
}

export interface UploadedAttachment {
  readonly id: string
  readonly url: string
  readonly filename: string
  readonly contentType: string
}

export interface UploadAttachmentRequest {
  readonly orgSlug: string
  readonly slug: string
  readonly id: TicketId
}

export interface UploadProjectImageRequest {
  readonly orgSlug: string
  readonly slug: string
}

export const uploadAttachmentRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId
): UploadAttachmentRequest => ({ orgSlug, slug, id })

export const uploadProjectImageRequest = (
  orgSlug: string,
  slug: string
): UploadProjectImageRequest => ({ orgSlug, slug })

const transferAttachment = (input: UploadAttachmentInput, uploadUrl: string) =>
  Effect.callback<void, AttachmentUploadFailed>((resume, signal) => {
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    signal.addEventListener("abort", abort)
    input.signal?.addEventListener("abort", abort)
    xhr.open("PUT", uploadUrl, true)
    xhr.setRequestHeader("content-type", input.file.type)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        input.onProgress?.(event.loaded / event.total)
      }
    }
    xhr.onload = () =>
      resume(
        xhr.status >= 200 && xhr.status < 300
          ? Effect.void
          : Effect.fail(
              new AttachmentUploadFailed({
                reason: "status",
                status: xhr.status
              })
            )
      )
    xhr.onerror = () =>
      resume(Effect.fail(new AttachmentUploadFailed({ reason: "network" })))
    xhr.onabort = () =>
      resume(Effect.fail(new AttachmentUploadFailed({ reason: "abort" })))
    xhr.send(input.file)
    return Effect.sync(() => {
      signal.removeEventListener("abort", abort)
      input.signal?.removeEventListener("abort", abort)
      xhr.abort()
    })
  })

const aborted = (input: UploadAttachmentInput) =>
  Effect.suspend(() =>
    input.signal?.aborted === true
      ? Effect.fail(new AttachmentUploadFailed({ reason: "abort" }))
      : Effect.void
  )

export const uploadAttachment = Atom.family((req: UploadAttachmentRequest) =>
  Api.runtime.fn(
    Effect.fn(function* (input: UploadAttachmentInput) {
      yield* aborted(input)
      const prepared = yield* Api.use((client) =>
        client.attachments.prepare({
          params: req,
          payload: {
            filename: input.file.name,
            contentType: input.file.type,
            byteSize: input.file.size
          }
        })
      )
      yield* aborted(input)
      yield* transferAttachment(input, prepared.uploadUrl)
      yield* aborted(input)
      const committed = yield* Api.use((client) =>
        client.attachments.commit({
          params: { ...req, attachmentId: prepared.id }
        })
      )
      yield* Reactivity.invalidate([Keys.attachments(req.orgSlug)])
      return {
        id: committed.id,
        url: committed.url,
        filename: committed.filename,
        contentType: committed.contentType
      } satisfies UploadedAttachment
    })
  )
)

export const uploadProjectImage = Atom.family(
  (req: UploadProjectImageRequest) =>
    Api.runtime.fn(
      Effect.fn(function* (input: UploadAttachmentInput) {
        yield* aborted(input)
        const prepared = yield* Api.use((client) =>
          client.attachments.prepareProject({
            params: req,
            payload: {
              filename: input.file.name,
              contentType: input.file.type,
              byteSize: input.file.size
            }
          })
        )
        yield* aborted(input)
        yield* transferAttachment(input, prepared.uploadUrl)
        yield* aborted(input)
        const committed = yield* Api.use((client) =>
          client.attachments.commitProject({
            params: { ...req, attachmentId: prepared.id }
          })
        )
        yield* Reactivity.invalidate([Keys.attachments(req.orgSlug)])
        return {
          id: yield* Schema.decodeEffect(AttachmentId)(committed.id).pipe(
            Effect.orDie
          ),
          url: committed.url,
          filename: committed.filename,
          contentType: committed.contentType
        } satisfies UploadedAttachment
      })
    )
)

export const ORG_ATTACHMENTS_PAGE_SIZE = ATTACHMENT_PAGE_SIZE

export interface OrgAttachmentsRequest {
  readonly params: { readonly orgSlug: string }
  readonly query: {
    readonly limit: number
    readonly page: number
    readonly status?: AttachmentStatus
    readonly projectSlug?: string
    readonly sort?: AttachmentSort
  }
}

export const orgAttachmentsRequest = (
  orgSlug: string,
  query: Omit<OrgAttachmentsRequest["query"], "limit">
): OrgAttachmentsRequest => ({
  params: { orgSlug },
  query: { ...query, limit: ORG_ATTACHMENTS_PAGE_SIZE }
})

const orgAttachmentsQuery = (req: OrgAttachmentsRequest) =>
  Api.query("attachments", "list", {
    params: req.params,
    query: req.query,
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.attachments(req.params.orgSlug)]
  })

const orgAttachmentsSummaryQuery = (req: OrgAttachmentsRequest) =>
  Api.query("attachments", "summary", {
    params: req.params,
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.attachments(req.params.orgSlug)]
  })

interface OrgAttachmentsView {
  readonly list: AttachmentListPage
  readonly summary: AttachmentSummary
}

const orgAttachmentsView = (req: OrgAttachmentsRequest) =>
  Atom.readable(
    (get) =>
      AsyncResult.map(
        AsyncResult.all([
          get(orgAttachmentsQuery(req)),
          get(orgAttachmentsSummaryQuery(req))
        ]),
        ([list, summary]): OrgAttachmentsView => ({ list, summary })
      ),
    (refresh) => {
      refresh(orgAttachmentsQuery(req))
      refresh(orgAttachmentsSummaryQuery(req))
    }
  )

const orgAttachmentsRegion = Atom.family((req: OrgAttachmentsRequest) =>
  Atom.optimistic(orgAttachmentsView(req))
)

export const orgAttachments = Atom.family((req: OrgAttachmentsRequest) =>
  Atom.map(orgAttachmentsRegion(req), (result) =>
    AsyncResult.map(result, (value) => value.list)
  )
)

export const orgAttachmentsSummary = Atom.family((req: OrgAttachmentsRequest) =>
  Atom.map(orgAttachmentsRegion(req), (result) =>
    AsyncResult.map(result, (value) => value.summary)
  )
)

const removeFromSummary = (
  summary: AttachmentSummary,
  removed: AttachmentListPage["items"]
): AttachmentSummary => {
  const counts = new Map(
    summary.byStatus.map((total) => [total.status, { ...total }])
  )
  for (const attachment of removed) {
    const total = counts.get(attachment.status)
    if (!total) continue
    counts.set(attachment.status, {
      ...total,
      count: Math.max(0, total.count - 1),
      bytes: Math.max(0, total.bytes - attachment.byteSize)
    })
  }
  return {
    count: Math.max(0, summary.count - removed.length),
    bytes: Math.max(
      0,
      summary.bytes - removed.reduce((sum, row) => sum + row.byteSize, 0)
    ),
    byStatus: [...counts.values()]
  }
}

export const deleteOrgAttachments = Atom.family((req: OrgAttachmentsRequest) =>
  Atom.optimisticFn(orgAttachmentsRegion(req), {
    reducer: (current, ids: ReadonlyArray<string>) =>
      AsyncResult.map(current, (value) => {
        const selected = new Set(ids)
        const removed = value.list.items.filter((row) => selected.has(row.id))
        return {
          list: {
            items: value.list.items.filter((row) => !selected.has(row.id)),
            total: Math.max(0, value.list.total - removed.length)
          },
          summary: removeFromSummary(value.summary, removed)
        }
      }),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(function* (ids: ReadonlyArray<string>, get) {
          yield* Effect.forEach(
            ids,
            (attachmentId) =>
              Api.use((client) =>
                client.attachments.remove({
                  params: { orgSlug: req.params.orgSlug, attachmentId }
                })
              ),
            { concurrency: 4 }
          )
          set(AsyncResult.map(get(orgAttachmentsRegion(req)), (value) => value))
        })
      )
  })
)
