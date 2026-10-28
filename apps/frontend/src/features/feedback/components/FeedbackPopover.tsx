import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { MessageSquarePlus } from "lucide-react"

import { NavButton } from "@/components/shell/NavItem"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { feedbackStatus } from "@/features/feedback/atoms/feedback"
import { SendFeedbackForm } from "@/features/feedback/forms/send-feedback"
import { m } from "@/paraglide/messages"

export function FeedbackPopover({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const status = useAtomValue(feedbackStatus(orgSlug))
  if (!AsyncResult.isSuccess(status) || !status.value.enabled) return null
  return (
    <Popover>
      <PopoverTrigger
        render={
          <NavButton
            variant="tinted"
            icon={MessageSquarePlus}
            label={m.feedback_open()}
          />
        }
      />
      <PopoverContent
        side="right"
        align="end"
        sideOffset={12}
        className="w-96 p-0"
      >
        <SendFeedbackForm
          orgSlug={orgSlug}
          attachments={status.value.attachments}
        />
      </PopoverContent>
    </Popover>
  )
}
