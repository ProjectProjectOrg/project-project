import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  pickStatusColor,
  StatusColor,
  StatusLabel,
  type ProjectStatus,
  type StatusPhase
} from "@pp/shared"
import * as Exit from "effect/Exit"
import { motion } from "motion/react"
import { useState } from "react"

import {
  createStatus,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { StatusEditor } from "@/features/statuses/components/StatusEditor"
import { statusCreateErrorMessage } from "@/lib/errorMessage"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

type Props = Readonly<{
  phase: StatusPhase
  statuses: ReadonlyArray<ProjectStatus>
  onClose: () => void
}>

export function StatusDraftRow({ phase, statuses, onClose }: Props) {
  const { orgSlug, slug } = useProjectRoute()
  const createMutation = createStatus(statusesRequest(orgSlug, slug))
  const create = useAtomSet(createMutation, { mode: "promiseExit" })
  const createState = useAtomValue(createMutation)
  const [didSubmit, setDidSubmit] = useState(false)
  const [color] = useState(() =>
    pickStatusColor(statuses.map((status) => status.color))
  )

  const error =
    didSubmit && !createState.waiting
      ? mutationErrorText(
          createState,
          statusCreateErrorMessage,
          m.tickets_status_create_error_fallback
        )
      : null

  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="list-none"
    >
      <StatusEditor
        initial={{ label: "", icon: "Circle", color, description: "" }}
        identityLocked={false}
        submitLabel={m.tickets_status_create_add()}
        error={error}
        onCancel={onClose}
        onSubmit={async (draft) => {
          setDidSubmit(true)
          const description = draft.description.trim()
          const exit = await create({
            label: StatusLabel.make(draft.label.trim()),
            icon: draft.icon,
            color: StatusColor.make(draft.color),
            description: description.length > 0 ? description : null,
            phase
          })
          if (Exit.isFailure(exit)) return false
          onClose()
          return true
        }}
      />
    </motion.li>
  )
}
