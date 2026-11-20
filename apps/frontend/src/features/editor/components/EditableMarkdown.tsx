import { LexicalEditor } from "@pp/ui/editor/lexical-editor"
import { Markdown } from "@pp/ui/editor/markdown"
import { type SaveStatus } from "@pp/ui/editor/save-queue"
import { useEditMode } from "@pp/ui/editor/use-edit-mode"
import { cn } from "@pp/ui/lib/utils"
import type { LexicalEditor as LexicalEditorType } from "lexical"
import { useRef, useState } from "react"

import { DescriptionActions } from "@/features/tickets/components/ticket-page/DescriptionActions"
import { appHotkeys } from "@/lib/appHotkeys"

// A long-form markdown body that reads as text until you press Edit: the
// project's About and a sprint's goal.
export function EditableMarkdown({
  markdown,
  editorKey,
  canEdit,
  blank,
  placeholder,
  onSave
}: Readonly<{
  markdown: string
  editorKey: string
  canEdit: boolean
  // Nothing written yet: a click anywhere starts editing.
  blank: boolean
  placeholder: string
  onSave: (next: string) => Promise<void>
}>) {
  const [status, setStatus] = useState<SaveStatus>("idle")
  const editorRef = useRef<LexicalEditorType | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const { editing, startEditing, stopEditing } = useEditMode({
    editorRef,
    rootRef,
    startHotkey: appHotkeys["tickets.edit-description"]
  })

  if (!canEdit) {
    return (
      <div className="min-w-0 px-3 py-2">
        <Markdown>{markdown}</Markdown>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      role="presentation"
      tabIndex={-1}
      className={cn(
        "relative min-w-0 rounded-xl py-2 transition-[background-color,box-shadow] duration-150 ease-out outline-none motion-reduce:transition-none",
        editing &&
          "bg-surface-2 shadow-surface-1 [--muted-foreground:color-mix(in_oklch,var(--color-muted-foreground)_88%,var(--color-foreground))]"
      )}
    >
      <div
        role="presentation"
        className={cn(
          "relative px-3 [&_.lexical-content]:min-h-0",
          (editing || blank) && "cursor-text"
        )}
        onClick={(event) => {
          if (editing || !blank) return
          if (
            event.target instanceof Element &&
            event.target.closest("a, button, input, label")
          )
            return
          startEditing()
        }}
      >
        <div className="relative flow-root">
          <DescriptionActions
            editing={editing}
            status={status}
            onEdit={startEditing}
            onDone={stopEditing}
          />
          <LexicalEditor
            key={editorKey}
            markdown={markdown}
            onChange={onSave}
            onStatusChange={setStatus}
            placeholder={placeholder}
            editorRef={editorRef}
            editable={editing}
          />
        </div>
      </div>
    </div>
  )
}
