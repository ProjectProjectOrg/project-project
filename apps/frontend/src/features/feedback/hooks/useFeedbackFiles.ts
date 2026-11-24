import { useAtom, useAtomSet } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import { useId, useRef, useState } from "react"

import { uploadFeedbackAttachment } from "@/features/feedback/atoms/feedback"
import {
  acceptFiles,
  type FileRejection
} from "@/features/feedback/lib/feedbackFiles"

import { feedbackDraft, type FeedbackFileDraft } from "../atoms/feedbackDraft"

export function useFeedbackFiles(orgSlug: string, route: string) {
  const [uploadAtom] = useState(() => uploadFeedbackAttachment(orgSlug))
  const upload = useAtomSet(uploadAtom, {
    mode: "promiseExit"
  })
  const [draft, setDraft] = useAtom(feedbackDraft(orgSlug))
  const drafts = draft.files
  const [rejection, setRejection] = useState<FileRejection | null>(null)
  const batchId = useId()
  const nextFile = useRef(0)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const settle = (
    key: string,
    exit: Exit.Exit<Readonly<{ id: string }>, unknown>
  ) =>
    setDraft((current) => ({
      ...current,
      files: current.files.map((file) => {
        if (file.key !== key) return file
        return Exit.isSuccess(exit)
          ? { ...file, state: "ready", id: exit.value.id }
          : { ...file, state: "failed" }
      })
    }))

  const add = (files: ReadonlyArray<File>) => {
    if (files.length === 0) return
    const { accepted, rejection } = acceptFiles(drafts.length, files)
    setRejection(rejection)
    const added = accepted.map(
      (file) =>
        ({
          key: `${batchId}-${nextFile.current++}`,
          file,
          state: "uploading"
        }) satisfies FeedbackFileDraft
    )
    if (added.length === 0) return
    setDraft((current) => ({
      ...current,
      route,
      files: [...current.files, ...added]
    }))
    for (const draft of added) {
      queue.current = queue.current.then(() =>
        upload(draft.file).then((exit) => settle(draft.key, exit))
      )
    }
  }

  const remove = (key: string) => {
    setRejection(null)
    setDraft((current) => ({
      ...current,
      files: current.files.filter((file) => file.key !== key)
    }))
  }

  return {
    drafts,
    rejection,
    uploading: drafts.some((draft) => draft.state === "uploading"),
    readyIds: drafts.flatMap((draft) =>
      draft.state === "ready" ? [draft.id] : []
    ),
    add,
    remove
  }
}
