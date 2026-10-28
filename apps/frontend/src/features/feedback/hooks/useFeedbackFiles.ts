import { useAtomSet } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import { useEffect, useRef, useState } from "react"

import { uploadFeedbackAttachment } from "@/features/feedback/atoms/feedback"
import {
  acceptFiles,
  type FileRejection
} from "@/features/feedback/lib/feedbackFiles"

export type FeedbackFileDraft = Readonly<
  { key: string; file: File; previewUrl: string } & (
    | { state: "uploading" }
    | { state: "ready"; id: string }
    | { state: "failed" }
  )
>

const revoke = (drafts: ReadonlyArray<FeedbackFileDraft>) => {
  for (const draft of drafts) URL.revokeObjectURL(draft.previewUrl)
}

export function useFeedbackFiles(orgSlug: string) {
  const upload = useAtomSet(uploadFeedbackAttachment(orgSlug), {
    mode: "promiseExit"
  })
  const [drafts, setDrafts] = useState<ReadonlyArray<FeedbackFileDraft>>([])
  const [rejection, setRejection] = useState<FileRejection | null>(null)
  const nextKey = useRef(0)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const live = useRef<ReadonlyArray<FeedbackFileDraft>>([])

  useEffect(() => {
    live.current = drafts
  }, [drafts])

  useEffect(() => () => revoke(live.current), [])

  const settle = (
    key: string,
    exit: Exit.Exit<Readonly<{ id: string }>, unknown>
  ) =>
    setDrafts((current) =>
      current.map((draft): FeedbackFileDraft => {
        if (draft.key !== key) return draft
        const { file, previewUrl } = draft
        return Exit.isSuccess(exit)
          ? { key, file, previewUrl, state: "ready", id: exit.value.id }
          : { key, file, previewUrl, state: "failed" }
      })
    )

  const add = (files: ReadonlyArray<File>) => {
    if (files.length === 0) return
    const { accepted, rejection } = acceptFiles(drafts.length, files)
    setRejection(rejection)
    const added = accepted.map(
      (file): FeedbackFileDraft => ({
        key: String(nextKey.current++),
        file,
        previewUrl: URL.createObjectURL(file),
        state: "uploading"
      })
    )
    setDrafts((current) => [...current, ...added])
    for (const draft of added) {
      queue.current = queue.current.then(() =>
        upload(draft.file).then((exit) => settle(draft.key, exit))
      )
    }
  }

  const remove = (key: string) => {
    setRejection(null)
    revoke(drafts.filter((draft) => draft.key === key))
    setDrafts((current) => current.filter((draft) => draft.key !== key))
  }

  const reset = () => {
    setRejection(null)
    revoke(drafts)
    setDrafts([])
  }

  return {
    drafts,
    rejection,
    uploading: drafts.some((draft) => draft.state === "uploading"),
    readyIds: drafts.flatMap((draft) =>
      draft.state === "ready" ? [draft.id] : []
    ),
    add,
    remove,
    reset
  }
}
