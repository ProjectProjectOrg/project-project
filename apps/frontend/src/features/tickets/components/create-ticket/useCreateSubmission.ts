import type { TicketId } from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Data from "effect/Data"
import * as Exit from "effect/Exit"
import { useState } from "react"

import { errorMessage } from "@/lib/errorMessage"

export type Submission = Data.TaggedEnum<{
  editing: Readonly<{ failure: string | null }>
  creating: {}
  linking: Readonly<{ id: TicketId }>
  linkFailed: Readonly<{ id: TicketId; failure: string }>
}>
export const Submission = Data.taggedEnum<Submission>()

const failureOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? errorMessage(Cause.squash(exit.cause)) : null

export function useCreateSubmission({
  create,
  link,
  done
}: Readonly<{
  create: () => Promise<Exit.Exit<TicketId, unknown>>
  link: (id: TicketId) => Promise<Exit.Exit<unknown, unknown>>
  done: (id: TicketId) => void
}>) {
  const [submission, setSubmission] = useState<Submission>(
    Submission.editing({ failure: null })
  )

  const finish = async (id: TicketId) => {
    setSubmission(Submission.linking({ id }))
    const failure = failureOf(await link(id))
    if (failure !== null) {
      setSubmission(Submission.linkFailed({ id, failure }))
      return
    }
    done(id)
  }

  const createThenLink = async () => {
    setSubmission(Submission.creating())
    const exit = await create()
    if (Exit.isSuccess(exit)) return finish(exit.value)
    setSubmission(Submission.editing({ failure: failureOf(exit) }))
  }

  const submit = () =>
    Submission.$match(submission, {
      editing: createThenLink,
      linkFailed: ({ id }) => finish(id),
      creating: () => Promise.resolve(),
      linking: () => Promise.resolve()
    })

  const clearFailure = () =>
    setSubmission((current) =>
      Submission.$is("editing")(current)
        ? Submission.editing({ failure: null })
        : current
    )

  return {
    submission,
    locked: !Submission.$is("editing")(submission),
    submit,
    clearFailure
  }
}
