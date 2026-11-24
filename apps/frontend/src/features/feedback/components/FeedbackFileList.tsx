import { useAtomValue } from "@effect/atom-react"
import { isRasterImageContentType } from "@pp/shared"
import { AttachmentChip } from "@pp/ui/attachment-chip"
import { CircleAlert, LoaderCircle, X } from "@pp/ui/icons"
import { chipIconActionClass } from "@pp/ui/morph-icon-link"
import * as Atom from "effect/reactivity/Atom"

import type { FeedbackFileDraft } from "@/features/feedback/atoms/feedbackDraft"
import { m } from "@/paraglide/messages"

const previewUrl = Atom.family((file: File) =>
  Atom.make((get) => {
    const url = URL.createObjectURL(file)
    get.addFinalizer(() => URL.revokeObjectURL(url))
    return url
  })
)

function FeedbackFileChip({
  draft,
  onRemove
}: Readonly<{ draft: FeedbackFileDraft; onRemove: () => void }>) {
  const url = useAtomValue(previewUrl(draft.file))
  const image = isRasterImageContentType(draft.file.type)
  const action =
    draft.state === "uploading" ? (
      <LoaderCircle
        strokeWidth={1.75}
        className="size-3 shrink-0 animate-spin text-muted-foreground"
        aria-label={m.feedback_file_uploading()}
      />
    ) : (
      <>
        {draft.state === "failed" ? (
          <CircleAlert
            strokeWidth={1.75}
            className="size-3 shrink-0 text-destructive"
            aria-label={m.feedback_file_failed()}
          />
        ) : null}
        <button
          type="button"
          className={chipIconActionClass}
          aria-label={m.feedback_file_remove({ filename: draft.file.name })}
          title={m.feedback_file_remove({ filename: draft.file.name })}
          onClick={onRemove}
        >
          <X strokeWidth={1.75} className="size-3" aria-hidden="true" />
        </button>
      </>
    )
  return (
    <AttachmentChip
      url={url}
      alt={draft.file.name}
      filename={draft.file.name}
      kind={image ? "image" : "file"}
      morphId={`feedback-file-${draft.key}`}
      downloadLabel={m.editor_attachment_download()}
      action={action}
    />
  )
}

export function FeedbackFileList({
  drafts,
  onRemove
}: Readonly<{
  drafts: ReadonlyArray<FeedbackFileDraft>
  onRemove: (key: string) => void
}>) {
  if (drafts.length === 0) return null
  return (
    <ul
      className="flex flex-wrap gap-y-1.5"
      aria-label={m.feedback_files_label()}
    >
      {drafts.map((draft) => (
        <li key={draft.key} className="max-w-full">
          <FeedbackFileChip
            draft={draft}
            onRemove={() => onRemove(draft.key)}
          />
        </li>
      ))}
    </ul>
  )
}
