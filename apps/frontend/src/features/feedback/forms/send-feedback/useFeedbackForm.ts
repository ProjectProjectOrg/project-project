import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import { useState } from "react"

import { useAppForm } from "@/lib/form"
import { mutationErrorText } from "@/lib/mutationError"

import { submitFeedback } from "../../atoms/feedback"
import {
  emptyFeedbackDraft,
  feedbackDraft,
  hasFeedbackDraft
} from "../../atoms/feedbackDraft"
import { useFeedbackFiles } from "../../hooks/useFeedbackFiles"
import { sendFeedbackFormOpts } from "./opts"

export function useFeedbackForm(
  orgSlug: string,
  pathname: string,
  onSent: () => void
) {
  const [draft, setDraft] = useAtom(feedbackDraft(orgSlug))
  const hasDraft = useAtomValue(hasFeedbackDraft(orgSlug))
  const [initial] = useState(() => ({
    values: draft.values,
    route: hasDraft ? (draft.route ?? pathname) : pathname
  }))
  const reset = () =>
    setDraft((current) => emptyFeedbackDraft(current.generation + 1))
  const files = useFeedbackFiles(orgSlug, initial.route)
  const submit = useAtomSet(submitFeedback(orgSlug), { mode: "promiseExit" })
  const state = useAtomValue(submitFeedback(orgSlug))
  const error = mutationErrorText(state)
  const busy = state.waiting || files.uploading
  const form = useAppForm({
    ...sendFeedbackFormOpts,
    defaultValues: initial.values,
    listeners: [
      {
        triggers: ["change"],
        run: ({ value }) =>
          setDraft((current) => ({
            ...current,
            values: value,
            route: initial.route
          }))
      }
    ],
    onSubmit: async ({ value }) => {
      const exit = await submit({
        kind: value.kind,
        title: value.title.trim(),
        description: value.description.trim(),
        route: initial.route,
        attachmentIds: files.readyIds
      })
      if (Exit.isSuccess(exit)) {
        onSent()
        reset()
      }
    }
  })
  return {
    form,
    initialMarkdown: initial.values.description,
    hasDraft,
    reset,
    files,
    busy,
    sending: state.waiting,
    error
  }
}
