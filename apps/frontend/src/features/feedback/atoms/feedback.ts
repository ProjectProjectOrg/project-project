import type { SubmitFeedbackInput } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"

export const feedbackStatus = Atom.family((orgSlug: string) =>
  Api.query("feedback", "status", {
    params: { orgSlug },
    timeToLive: "5 minutes"
  })
)

export const uploadFeedbackAttachment = Atom.family((orgSlug: string) =>
  Api.runtime.fn(
    Effect.fn("uploadFeedbackAttachment")(function* (file: File) {
      const form = new FormData()
      form.append("file", file)
      return yield* Api.use((client) =>
        client.feedback.upload({ params: { orgSlug }, payload: form })
      )
    })
  )
)

export const submitFeedback = Atom.family((orgSlug: string) =>
  Api.runtime.fn(
    Effect.fn("submitFeedback")(function* (input: SubmitFeedbackInput) {
      yield* Api.use((client) =>
        client.feedback.submit({ params: { orgSlug }, payload: input })
      )
    })
  )
)
