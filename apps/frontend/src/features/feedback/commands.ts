import { MessageSquarePlus } from "@pp/ui/icons"

import { Command } from "@/features/command-menu/lib/commands"
import { m } from "@/paraglide/messages"

export const feedbackCommands: ReadonlyArray<Command> = [
  Command.run({
    id: "feedback.send",
    group: "miscellaneous",
    label: ({ hasFeedbackDraft }) =>
      hasFeedbackDraft ? m.feedback_continue() : m.feedback_open(),
    icon: MessageSquarePlus,
    keywords: ["send feedback", "bug", "report", "feature", "request", "issue"],
    when: ({ canSendFeedback }) => canSendFeedback,
    run: (_context, env) => {
      env.open("sendFeedback")
    }
  })
]
