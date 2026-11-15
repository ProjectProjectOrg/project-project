import { useAtomSet } from "@effect/atom-react"
import { CommandMenuItem } from "@pp/ui/command-menu"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import { Bug, Lightbulb } from "lucide-react"
import { useState } from "react"

import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import { submitFeedback } from "@/features/feedback/atoms/feedback"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

const KINDS = ["bug", "feature"] as const

// "Send feedback" from cmd+k: type it in a line, pick bug or feature. For
// a description and attachments, the sidebar's Send feedback button opens
// the full form in a popover.
export function SendFeedbackPage({
  context,
  chip,
  onBack,
  env
}: CommandPageProps) {
  const send = useAtomSet(submitFeedback(context.orgSlug), {
    mode: "promiseExit"
  })
  const [title, setTitle] = useState("")
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const trimmed = title.trim()
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.feedback_command_placeholder()}
      onBack={onBack}
      filter={false}
      notice={failure}
      onSearchChange={(value) => {
        setFailure(null)
        setTitle(value)
      }}
      items={
        trimmed === ""
          ? []
          : [
              {
                value: "bug",
                label: m.feedback_command_bug({ title: trimmed }),
                icon: Bug
              },
              {
                value: "feature",
                label: m.feedback_command_feature({ title: trimmed }),
                icon: Lightbulb
              }
            ]
      }
      renderItem={(item) => (
        <CommandMenuItem value={item.value}>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </CommandMenuItem>
      )}
      onSelect={async (item) => {
        const kind = KINDS.find((each) => each === item.value)
        if (kind === undefined || pending || trimmed === "") return
        setPending(true)
        setFailure(null)
        const exit = await send({
          kind,
          title: trimmed,
          description: "",
          route: window.location.pathname,
          attachmentIds: []
        })
        setPending(false)
        if (Exit.isFailure(exit)) {
          setFailure(errorMessage(Cause.squash(exit.cause)))
          return
        }
        env.close()
      }}
    />
  )
}
