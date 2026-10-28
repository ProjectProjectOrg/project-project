import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { ATTACHMENT_CONTENT_TYPES, type FeedbackKind } from "@pp/shared"
import { useLocation } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import { CircleCheck, Paperclip, Send } from "lucide-react"
import { AnimatePresence, motion, type Variants } from "motion/react"
import {
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent
} from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  SegmentedTabs,
  type SegmentedItem
} from "@/components/ui/segmented-tabs"
import { submitFeedback } from "@/features/feedback/atoms/feedback"
import { FeedbackFileList } from "@/features/feedback/components/FeedbackFileList"
import { useFeedbackFiles } from "@/features/feedback/hooks/useFeedbackFiles"
import type { FileRejection } from "@/features/feedback/lib/feedbackFiles"
import { useAppForm, useFormValues } from "@/lib/form"
import { mutationErrorText } from "@/lib/mutationError"
import { spring } from "@/lib/springs"
import { cn } from "@/lib/utils"
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

const placeholderSwap: Variants = {
  shown: {
    opacity: 1,
    filter: "blur(0px)",
    transition: {
      type: "tween",
      duration: spring.moderate.duration,
      ease: "easeOut"
    }
  },
  hidden: {
    opacity: 0,
    filter: "blur(4px)",
    transition: { type: "tween", ...spring.moderate.exit, ease: "easeIn" }
  }
}

const rejectionText: Readonly<Record<FileRejection, () => string>> = {
  too_many: m.feedback_files_too_many,
  too_large: m.feedback_files_too_large,
  unsupported: m.feedback_files_unsupported
}

export function SendFeedbackForm({
  orgSlug,
  attachments
}: Readonly<{ orgSlug: string; attachments: boolean }>) {
  const { pathname } = useLocation()
  const [sent, setSent] = useState(false)
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
    setSent(false)
    titleRef.current?.focus()
  }
  const attachPasted = (event: ClipboardEvent) => {
    if (!attachments || event.clipboardData.files.length === 0) return
    event.preventDefault()
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
        <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
          <form.Field name="kind">
            {(field) => (
              <SegmentedTabs
                variant="rail"
                className="self-start"
                aria-label={m.feedback_kind_aria_label()}
                items={kindItems()}
                value={field.value}
                onValueChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="title">
            {(field) => {
              const placeholder =
                values.kind === "bug"
                  ? m.feedback_title_placeholder_bug()
                  : m.feedback_title_placeholder_feature()
              return (
                <div className="grid text-[15px] leading-6 font-medium">
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
                    className="col-start-1 row-start-1 text-[15px] leading-6"
                  />
                  {field.value === "" ? (
                    <span
                      aria-hidden
                      className="pointer-events-none col-start-1 row-start-1 grid text-muted-foreground"
                    >
                      <AnimatePresence initial={false}>
                        <motion.span
                          key={values.kind}
                          variants={placeholderSwap}
                          initial="hidden"
                          animate="shown"
                          exit="hidden"
                          className="col-start-1 row-start-1 whitespace-nowrap"
                        >
                          {placeholder}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  ) : null}
                </div>
              )
            }}
          </form.Field>
          <form.Field name="description">
            {(field) => (
              <textarea
                value={field.value}
                maxLength={20_000}
                rows={5}
                aria-label={m.feedback_description_label()}
                placeholder={m.feedback_description_placeholder()}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                onKeyDown={sendOnModEnter}
                onPaste={attachPasted}
                onDragOver={allowDrop}
                onDrop={attachDropped}
                className="w-full resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
            )}
          </form.Field>
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
            return message === null ? null : (
              <p role="alert" className="px-4 pb-3 text-xs text-destructive">
                {message}
              </p>
            )
          }}
        </form.Field>
        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {attachments ? <AttachButton onFiles={files.add} /> : null}
            <p className="truncate text-xs text-muted-foreground">
              {attachments
                ? m.feedback_attach_hint()
                : m.feedback_attach_unavailable()}
            </p>
          </div>
          <Button
            type="submit"
            size="xs"
            leadingIcon={Send}
            disabled={busy}
            className={cn(state.waiting && "animate-pulse")}
          >
            {state.waiting ? m.feedback_sending() : m.feedback_submit()}
          </Button>
        </div>
      </motion.form>
      <FeedbackSent sent={sent} onSendAnother={sendAnother} />
      <span aria-live="polite" className="sr-only">
        {sent ? m.feedback_sent() : ""}
      </span>
    </div>
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
        variant="quiet"
        size="square-7"
        aria-label={m.feedback_attach()}
        title={m.feedback_attach()}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="size-4" strokeWidth={1.75} />
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
      <p className="text-[13px]">{m.feedback_sent()}</p>
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
