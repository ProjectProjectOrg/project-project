import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type { ReactNode } from "react"

import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import { feedbackStatus } from "@/features/feedback/atoms/feedback"
import { SendFeedbackForm } from "@/features/feedback/forms/send-feedback"

// The form's heading. In a popover this is PopoverTitle; inside cmd+k it's a
// plain heading, since the menu names itself.
function Heading({
  className,
  children
}: Readonly<{ className?: string; children: ReactNode }>) {
  return <h2 className={className}>{children}</h2>
}

// "Send feedback" in cmd+k: the full feedback form, inside the command menu.
export function SendFeedbackPage({ context, env }: CommandPageProps) {
  const status = useAtomValue(feedbackStatus(context.orgSlug))
  return (
    <SendFeedbackForm
      orgSlug={context.orgSlug}
      attachments={AsyncResult.isSuccess(status) && status.value.attachments}
      Title={Heading}
      onDone={env.close}
    />
  )
}
