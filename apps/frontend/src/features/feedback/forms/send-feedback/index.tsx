import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { ATTACHMENT_CONTENT_TYPES, type FeedbackKind } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { LexicalEditor } from "@pp/ui/editor/lexical-editor"
import { CircleCheck, Paperclip } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { spring } from "@pp/ui/lib/springs"
import { cn } from "@pp/ui/lib/utils"
import { SegmentedTabs, type SegmentedItem } from "@pp/ui/segmented-tabs"
import { TextSwap } from "@pp/ui/text-swap"
import { useLocation } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import { motion, type Variants } from "motion/react"
import {
  useRef,
  useState,
  type ClipboardEvent,
  type ComponentType,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode
} from "react"
import { flushSync } from "react-dom"

import { submitFeedback } from "@/features/feedback/atoms/feedback"
import { FeedbackFileList } from "@/features/feedback/components/FeedbackFileList"
import { useFeedbackFiles } from "@/features/feedback/hooks/useFeedbackFiles"
import type { FileRejection } from "@/features/feedback/lib/feedbackFiles"
import { useAppForm, useFormValues } from "@/lib/form"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import { sendFeedbackFormOpts } from "./opts"

const kindItems = (): ReadonlyArray<SegmentedItem<FeedbackKind>> => [
  { key: "bug", label: m.feedback_kind_bug() },
  { key: "feature", label: m.feedback_kind_feature() }
]

const swap: Variants = {
  shown: (delay = 0) => ({
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      type: "tween",
      duration: spring.slow.duration,
      ease: "easeOut",
      delay
    }
  }),
  hidden: {
    opacity: 0,
    scale: 0.97,
    filter: "blur(4px)",
    transition: { type: "tween", ...spring.slow.exit, ease: "easeIn" }
  }
}

const rejectionText: Readonly<Record<FileRejection, () => string>> = {
  too_many: m.feedback_files_too_many,
  too_large: m.feedback_files_too_large,
  unsupported: m.feedback_files_unsupported
}

export function SendFeedbackForm({
  orgSlug,
  attachments,
  Title,
  onDone
}: Readonly<{
  orgSlug: string
  attachments: boolean
  Title: ComponentType<{ className?: string; children: ReactNode }>
  onDone: () => void
}>) {
  const { pathname } = useLocation()
  const [sent, setSent] = useState(false)
  const [round, setRound] = useState(0)
  const titleRef = useRef<HTMLInputElement>(null)
  const files = useFeedbackFiles(orgSlug)
  const submit = useAtomSet(submitFeedback(orgSlug), { mode: "promiseExit" })
  const state = useAtomValue(submitFeedback(orgSlug))
  const error = mutationErrorText(state)
  const busy = state.waiting || files.uploading
  const form = useAppForm({
    ...sendFeedbackFormOpts,
    onSubmit: async ({ value }) => {
      const exit = await submit({
        kind: value.kind,
        title: value.title.trim(),
        description: value.description.trim(),
        route: pathname,
        attachmentIds: files.readyIds
      })
      if (Exit.isSuccess(exit)) setSent(true)
    }
  })
  const values = useFormValues(form)
  const send = () => {
    if (!busy) void form.handleSubmit()
  }
  const sendAnother = () => {
    form.reset()
    files.reset()
    setRound((current) => current + 1)
    flushSync(() => setSent(false))
    titleRef.current?.focus()
  }
  const attachPasted = (event: ClipboardEvent) => {
    if (
      !attachments ||
      event.clipboardData.files.length === 0 ||
      event.clipboardData.getData("text/plain") !== ""
    )
      return
    event.preventDefault()
    event.stopPropagation()
    files.add([...event.clipboardData.files])
  }
  const allowDrop = (event: DragEvent) => {
    if (attachments && event.dataTransfer.types.includes("Files")) {
      event.preventDefault()
    }
  }
  const attachDropped = (event: DragEvent) => {
    if (!attachments || event.dataTransfer.files.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    files.add([...event.dataTransfer.files])
  }
  const sendOnModEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      send()
    }
  }

  return (
    <div className="grid">
      <motion.form
        initial={false}
        variants={swap}
        animate={sent ? "hidden" : "shown"}
        inert={sent}
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
        className="col-start-1 row-start-1 flex flex-col"
        aria-label={m.feedback_title()}
      >
        <Composer.Header control>
          <form.Field name="kind">
            {(field) => (
              <SegmentedTabs
                variant="rail"
                aria-label={m.feedback_kind_aria_label()}
                items={kindItems()}
                value={field.value}
                onValueChange={field.handleChange}
              />
            )}
          </form.Field>
          <Title className="sr-only">{m.feedback_title()}</Title>
        </Composer.Header>
        <form.Field name="title">
          {(field) => {
            const placeholder =
              values.kind === "bug"
                ? m.feedback_title_placeholder_bug()
                : m.feedback_title_placeholder_feature()
            return (
              <Composer.Title className="grid leading-6">
                <Input
                  ref={titleRef}
                  variant="bare"
                  autoFocus
                  value={field.value}
                  maxLength={200}
                  aria-label={m.feedback_title_label()}
                  aria-placeholder={placeholder}
                  aria-invalid={field.errors.length > 0}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  onKeyDown={sendOnModEnter}
                  onPaste={attachPasted}
                  className="col-start-1 row-start-1 leading-6"
                />
                {field.value === "" ? (
                  <TitlePlaceholder placeholder={placeholder} />
                ) : null}
              </Composer.Title>
            )
          }}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <Composer.Body
              onKeyDownCapture={sendOnModEnter}
              onPasteCapture={attachPasted}
              onDragOverCapture={allowDrop}
              onDropCapture={attachDropped}
            >
              <LexicalEditor
                key={round}
                markdown=""
                onDraftChange={field.handleChange}
                placeholder={m.feedback_description_placeholder()}
              />
            </Composer.Body>
          )}
        </form.Field>
        <div className="px-4 pt-2 empty:hidden">
          <FeedbackFileList drafts={files.drafts} onRemove={files.remove} />
        </div>
        <form.Field name="title">
          {(field) => {
            const message =
              field.errors.length > 0
                ? m.feedback_title_required()
                : files.rejection !== null
                  ? rejectionText[files.rejection]()
                  : error
            return <Composer.Error>{message}</Composer.Error>
          }}
        </form.Field>
        <Composer.Tray>
          {attachments ? (
            <Composer.Fields>
              <AttachButton onFiles={files.add} />
            </Composer.Fields>
          ) : null}
          <Composer.Footer>
            <Composer.Hint>
              {attachments
                ? m.feedback_attach_hint()
                : m.feedback_attach_unavailable()}
            </Composer.Hint>
            <Composer.Actions>
              <Button type="button" variant="ghost" size="sm" onClick={onDone}>
                {m.common_cancel_button()}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={busy}
                className={cn(state.waiting && "animate-pulse")}
              >
                {state.waiting ? m.feedback_sending() : m.feedback_submit()}
              </Button>
            </Composer.Actions>
          </Composer.Footer>
        </Composer.Tray>
      </motion.form>
      <FeedbackSent sent={sent} onSendAnother={sendAnother} />
      <span aria-live="polite" className="sr-only">
        {sent ? m.feedback_sent() : ""}
      </span>
    </div>
  )
}

function TitlePlaceholder({ placeholder }: Readonly<{ placeholder: string }>) {
  return (
    <span
      aria-hidden
      className="pointer-events-none col-start-1 row-start-1 grid text-muted-foreground"
    >
      <TextSwap className="col-start-1 row-start-1">{placeholder}</TextSwap>
    </span>
  )
}

function AttachButton({
  onFiles
}: Readonly<{ onFiles: (files: ReadonlyArray<File>) => void }>) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        tone="strong"
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="size-3.5" strokeWidth={1.75} />
        <span>{m.feedback_attach()}</span>
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={ATTACHMENT_CONTENT_TYPES.join(",")}
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])])
          event.target.value = ""
        }}
      />
    </>
  )
}

function FeedbackSent({
  sent,
  onSendAnother
}: Readonly<{ sent: boolean; onSendAnother: () => void }>) {
  return (
    <motion.div
      initial={false}
      variants={swap}
      custom={spring.slow.exit.duration}
      animate={sent ? "shown" : "hidden"}
      inert={!sent}
      className="col-start-1 row-start-1 flex flex-col items-center justify-center gap-3 p-4 text-center"
    >
      <CircleCheck className="size-6 text-muted-foreground" strokeWidth={1.5} />
      <p className="text-body">{m.feedback_sent()}</p>
      <Button
        type="button"
        variant="tertiary"
        size="xs"
        onClick={onSendAnother}
      >
        {m.feedback_send_another()}
      </Button>
    </motion.div>
  )
}
