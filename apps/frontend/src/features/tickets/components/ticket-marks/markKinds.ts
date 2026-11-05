import {
  Copy,
  Link2,
  OctagonAlert,
  OctagonMinus,
  type LucideIcon
} from "lucide-react"

import type { MarkPickKind } from "@/features/tickets/lib/relationGroups"
import { m } from "@/paraglide/messages"

export const MARK_KINDS: ReadonlyArray<
  Readonly<{
    kind: MarkPickKind
    icon: LucideIcon
    label: () => string
    command: () => string
  }>
> = [
  {
    kind: "blockedBy",
    icon: OctagonMinus,
    label: m.tickets_mark_blocked_by,
    command: m.tickets_command_mark_blocked_by
  },
  {
    kind: "blocking",
    icon: OctagonAlert,
    label: m.tickets_mark_blocking,
    command: m.tickets_command_mark_blocking
  },
  {
    kind: "related",
    icon: Link2,
    label: m.tickets_mark_related,
    command: m.tickets_command_mark_related
  },
  {
    kind: "duplicateOf",
    icon: Copy,
    label: m.tickets_mark_duplicate_of,
    command: m.tickets_command_mark_duplicate_of
  }
]
