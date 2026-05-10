import { Atom } from "@effect-atom/atom-react"
import type { TagName, TicketStatus, TicketType } from "@projectproject/shared"
import { ticketListUiKey, type ProjectKey } from "@/atoms/keys"
import type { SortKey } from "@/components/TicketList/sort"

export { ticketListUiKey }

export const queryAtom = Atom.family((_key: ProjectKey) => Atom.make(""))

export const statusFilterAtom = Atom.family((_key: ProjectKey) =>
  Atom.make<TicketStatus | "all">("all")
)

export const typeFilterAtom = Atom.family((_key: ProjectKey) =>
  Atom.make<TicketType | "all">("all")
)

export const assigneeFilterAtom = Atom.family((_key: ProjectKey) =>
  Atom.make<string>("all")
)

export const selectedTagsAtom = Atom.family((_key: ProjectKey) =>
  Atom.make<ReadonlyArray<TagName>>([])
)

export const sortKeyAtom = Atom.family((_key: ProjectKey) =>
  Atom.make<SortKey>("id")
)

export const searchFocusedAtom = Atom.family((_key: ProjectKey) =>
  Atom.make(false)
)
