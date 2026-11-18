import { useAtomValue } from "@effect/atom-react"
import { Composer } from "@pp/ui/composer"
import { Popover, PopoverTitle } from "@pp/ui/popover"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type { RefObject } from "react"

import { feedbackStatus } from "@/features/feedback/atoms/feedback"
import { SendFeedbackForm } from "@/features/feedback/forms/send-feedback"

export function useFeedbackEnabled(orgSlug: string) {
  const status = useAtomValue(feedbackStatus(orgSlug))
  return AsyncResult.isSuccess(status) && status.value.enabled
}

export function FeedbackPopover({
  orgSlug,
  open,
  onOpenChange,
  onDone,
  anchor
}: Readonly<{
  orgSlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
  anchor: RefObject<HTMLElement | null>
}>) {
  const status = useAtomValue(feedbackStatus(orgSlug))
  if (!AsyncResult.isSuccess(status) || !status.value.enabled) return null
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Composer.Popover
        anchor={anchor}
        side="right"
        align="end"
        sideOffset={12}
        finalFocus={anchor}
        onKeyDown={(event) => {
          if (event.key !== "Escape") event.stopPropagation()
        }}
      >
        <SendFeedbackForm
          orgSlug={orgSlug}
          attachments={status.value.attachments}
          Title={PopoverTitle}
          onDone={() => {
            onOpenChange(false)
            onDone?.()
          }}
        />
      </Composer.Popover>
    </Popover>
  )
}
