import { useAtomValue } from "@effect/atom-react"
import { Composer } from "@pp/ui/composer"
import { MessageSquarePlus } from "@pp/ui/icons"
import { Popover, PopoverTitle, PopoverTrigger } from "@pp/ui/popover"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useState } from "react"

import { NavButton } from "@/components/shell/NavItem"
import { feedbackStatus } from "@/features/feedback/atoms/feedback"
import { SendFeedbackForm } from "@/features/feedback/forms/send-feedback"
import { m } from "@/paraglide/messages"

export function FeedbackPopover({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const status = useAtomValue(feedbackStatus(orgSlug))
  const [open, setOpen] = useState(false)
  if (!AsyncResult.isSuccess(status) || !status.value.enabled) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <NavButton
            variant="tinted"
            icon={MessageSquarePlus}
            label={m.feedback_open()}
          />
        }
      />
      <Composer.Popover side="right" align="end" sideOffset={12}>
        <SendFeedbackForm
          orgSlug={orgSlug}
          attachments={status.value.attachments}
          Title={PopoverTitle}
          onDone={() => setOpen(false)}
        />
      </Composer.Popover>
    </Popover>
  )
}
