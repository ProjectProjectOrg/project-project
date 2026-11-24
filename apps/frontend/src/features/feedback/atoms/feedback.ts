import type { SubmitFeedbackInput } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { query } from "@/api/query"

export const feedbackStatus = Atom.family((orgSlug: string) =>
  query("feedback", "status", {
    params: { orgSlug }
  })
)

const uploadAttachment = Effect.fn("uploadFeedbackAttachment")(function* (
  orgSlug: string,
  file: File
) {
  const form = new FormData()
  form.append("file", file)
  return yield* Api.use((client) =>
    client.feedback.upload({ params: { orgSlug }, payload: form })
  )
})

export const uploadFeedbackAttachment = (orgSlug: string) =>
  Api.runtime.fn((file: File) => uploadAttachment(orgSlug, file))

type Report = Omit<SubmitFeedbackInput, "attachmentIds"> &
  Readonly<{
    attachments: ReadonlyArray<Readonly<{ id: string; file: File }>>
  }>

export const submitFeedback = Atom.family((orgSlug: string) =>
  Api.runtime.fn(
    Effect.fn("submitFeedback")(function* ({ attachments, ...report }: Report) {
      const client = yield* Api
      const send = (attachmentIds: ReadonlyArray<string>) =>
        client.feedback.submit({
          params: { orgSlug },
          payload: { ...report, attachmentIds }
        })
      yield* send(attachments.map(({ id }) => id)).pipe(
        Effect.catchTag("FeedbackRejected", (error) =>
          error.kind === "unknown_attachment" && attachments.length > 0
            ? Effect.forEach(attachments, ({ file }) =>
                uploadAttachment(orgSlug, file)
              ).pipe(
                Effect.flatMap((uploaded) => send(uploaded.map(({ id }) => id)))
              )
            : Effect.fail(error)
        )
      )
    })
  )
)
