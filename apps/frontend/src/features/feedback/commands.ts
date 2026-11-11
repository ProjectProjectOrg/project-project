import { MessageSquarePlus } from "lucide-react"

import type { Command } from "@/features/command-menu/lib/commands"
import { sendFeedbackDialog } from "@/features/feedback/atoms/feedback"
import { m } from "@/paraglide/messages"

export const feedbackCommands: ReadonlyArray<Command> = [
  {
    id: "feedback.send",
    group: "miscellaneous",
    label: m.feedback_open,
    icon: MessageSquarePlus,
    keywords: ["bug", "report", "feature", "request", "issue"],
    when: ({ canSendFeedback }) => canSendFeedback,
    run: ({ orgSlug }, env) => {
      env.close()
      env.registry.set(sendFeedbackDialog, { orgSlug })
    }
  }
]
