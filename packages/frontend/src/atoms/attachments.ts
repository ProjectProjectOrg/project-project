import { Atom } from "@effect-atom/atom-react"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import { splitTicketKey } from "./tickets"

export class AttachmentUploadFailed extends Data.TaggedError(
  "AttachmentUploadFailed"
)<{
  readonly reason: "status" | "network" | "abort"
  readonly status?: number
}> {}

export interface UploadAttachmentInput {
  readonly file: File
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
      const client = yield* ApiClient
      const prepared = yield* client.attachments.prepare({
        path: { orgSlug, slug, id },
        payload: {
          filename: input.file.name,
          contentType: input.file.type,
          byteSize: input.file.size
        }
      })

      yield* Effect.async<void, AttachmentUploadFailed>((resume) => {
        const xhr = new XMLHttpRequest()
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
        return Effect.sync(() => xhr.abort())
      })

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
