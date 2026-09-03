import { Atom, Result } from "@effect-atom/atom-react"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import { splitOrgAttachmentsKey } from "./orgAttachmentsKey"
import { splitTicketKey } from "./tickets"

import type { AttachmentRow } from "@projectproject/shared"

export interface OrgAttachmentsPage {
  readonly items: ReadonlyArray<AttachmentRow>
  readonly nextCursor: string | null
}

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

const orgAttachmentsBaseAtom = Atom.family((key: string) => {
  const query = splitOrgAttachmentsKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        const items: Array<AttachmentRow> = []
        let cursor: string | null = null
        let nextCursor: string | null = null
        for (let page = 0; page < query.pages; page++) {
          const result: OrgAttachmentsPage = yield* client.attachments.list({
            path: { orgSlug: query.orgSlug },
            urlParams: {
              limit: ORG_ATTACHMENTS_PAGE_SIZE,
              ...(query.status ? { status: query.status } : {}),
              ...(query.projectSlug ? { projectSlug: query.projectSlug } : {}),
              ...(query.sort ? { sort: query.sort } : {}),
              ...(cursor ? { cursor } : {})
            }
          })
          items.push(...result.items)
          nextCursor = result.nextCursor
          if (result.nextCursor === null) break
          cursor = result.nextCursor
        }
        return { items, nextCursor } satisfies OrgAttachmentsPage
      })
    )
    .pipe(Atom.setIdleTTL("30 seconds"))
})

export const orgAttachmentsAtom = Atom.family((key: string) =>
  Atom.optimistic(orgAttachmentsBaseAtom(key))
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
      return Result.success(
        {
          items: current.value.items.filter((row) => !removed.has(row.id)),
          nextCursor: current.value.nextCursor
        },
        { waiting: true }
      )
    },
    fn: runtime.fn(
      Effect.fn(function* (ids: ReadonlyArray<string>, get) {
        const client = yield* ApiClient
        yield* Effect.forEach(ids, (attachmentId) =>
          client.attachments.remove({
            path: { orgSlug: query.orgSlug, attachmentId }
          })
        )
        get.refresh(orgAttachmentsBaseAtom(key))
        get.refresh(orgAttachmentsSummaryBaseAtom(query.orgSlug))
      })
    )
  })
})
