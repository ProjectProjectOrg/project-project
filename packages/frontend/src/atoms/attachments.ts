import { Atom, Result } from "@effect-atom/atom-react"
import * as Arr from "effect/Array"
import * as Chunk from "effect/Chunk"
import { NoSuchElementException } from "effect/Cause"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import { splitOrgAttachmentsKey } from "./orgAttachmentsKey"
import { splitTicketKey } from "./tickets"

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

export const uploadAttachmentAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitTicketKey(key)
  return runtime.fn(
    Effect.fn(function* (input: UploadAttachmentInput) {
      const aborted = Effect.suspend(() =>
        input.signal?.aborted === true
          ? Effect.fail(new AttachmentUploadFailed({ reason: "abort" }))
          : Effect.void
      )

      yield* aborted

      const client = yield* ApiClient
      const prepared = yield* client.attachments.prepare({
        path: { orgSlug, slug, id },
        payload: {
          filename: input.file.name,
          contentType: input.file.type,
          byteSize: input.file.size
        }
      })

      yield* aborted

      yield* Effect.async<void, AttachmentUploadFailed>((resume) => {
        const xhr = new XMLHttpRequest()
        const abort = () => xhr.abort()
        input.signal?.addEventListener("abort", abort)
        xhr.open("PUT", prepared.uploadUrl, true)
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
          input.signal?.removeEventListener("abort", abort)
          xhr.abort()
        })
      })

      yield* aborted

      const committed = yield* client.attachments.commit({
        path: { orgSlug, slug, id, attachmentId: prepared.id }
      })

      return {
        id: committed.id,
        url: committed.url,
        filename: committed.filename,
        contentType: committed.contentType
      } satisfies UploadedAttachment
    })
  )
})

const ORG_ATTACHMENTS_PAGE_SIZE = 50

const orgAttachmentsPullAtom = Atom.family((key: string) => {
  const query = splitOrgAttachmentsKey(key)
  return runtime
    .pull(
      Stream.paginateChunkEffect(Option.none<string>(), (cursor) =>
        Effect.gen(function* () {
          const client = yield* ApiClient
          const page = yield* client.attachments.list({
            path: { orgSlug: query.orgSlug },
            urlParams: {
              limit: ORG_ATTACHMENTS_PAGE_SIZE,
              ...(query.status ? { status: query.status } : {}),
              ...(query.projectSlug ? { projectSlug: query.projectSlug } : {}),
              ...(query.sort ? { sort: query.sort } : {}),
              ...Option.match(cursor, {
                onNone: () => ({}),
                onSome: (value) => ({ cursor: value })
              })
            }
          })
          return [
            Chunk.fromIterable(page.items),
            page.nextCursor === null
              ? Option.none<Option.Option<string>>()
              : Option.some(Option.some(page.nextCursor))
          ] as const
        })
      )
    )
    .pipe(Atom.setIdleTTL("30 seconds"))
})

export const loadMoreOrgAttachmentsAtom = orgAttachmentsPullAtom

export const orgAttachmentsAtom = Atom.family((key: string) =>
  Atom.optimistic(orgAttachmentsPullAtom(key))
)

const orgAttachmentsSummaryBaseAtom = Atom.family((orgSlug: string) =>
  runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.attachments.summary({ path: { orgSlug } })
      })
    )
    .pipe(Atom.setIdleTTL("30 seconds"))
)

export const orgAttachmentsSummaryAtom = Atom.family((orgSlug: string) =>
  Atom.optimistic(orgAttachmentsSummaryBaseAtom(orgSlug))
)

export const deleteOrgAttachmentsAtom = Atom.family((key: string) => {
  const query = splitOrgAttachmentsKey(key)
  return Atom.optimisticFn(orgAttachmentsAtom(key), {
    reducer: (current, ids: ReadonlyArray<string>) => {
      if (!Result.isSuccess(current)) return current
      const removed = new Set(ids)
      const items = current.value.items.filter((row) => !removed.has(row.id))
      return Arr.isNonEmptyArray(items)
        ? Result.success({ done: current.value.done, items }, { waiting: true })
        : Result.fail(new NoSuchElementException(), { waiting: true })
    },
    fn: runtime.fn(
      Effect.fn(function* (ids: ReadonlyArray<string>, get) {
        const client = yield* ApiClient
        yield* Effect.forEach(
          ids,
          (attachmentId) =>
            client.attachments.remove({
              path: { orgSlug: query.orgSlug, attachmentId }
            }),
          { concurrency: 4 }
        ).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              get.refresh(orgAttachmentsSummaryBaseAtom(query.orgSlug))
            })
          )
        )
      })
    )
  })
})
