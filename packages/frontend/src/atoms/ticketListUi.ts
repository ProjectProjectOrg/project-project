import { Atom } from "@effect-atom/atom-react"
import type {
  TagName,
  TicketStatus,
  TicketType
} from "@projectproject/shared"
import type { SortKey } from "@/components/TicketList/sort"

export const ticketListUiKey = (orgSlug: string, slug: string) =>
  `${orgSlug}/${slug}`

export const queryAtom = Atom.family((_key: string) => Atom.make(""))

export const statusFilterAtom = Atom.family((_key: string) =>
  Atom.make<TicketStatus | "all">("all")
)

export const typeFilterAtom = Atom.family((_key: string) =>
  Atom.make<TicketType | "all">("all")
)

export const assigneeFilterAtom = Atom.family((_key: string) =>
  Atom.make<string>("all")
)

export const selectedTagsAtom = Atom.family((_key: string) =>
  Atom.make<ReadonlyArray<TagName>>([])
)

export const sortKeyAtom = Atom.family((_key: string) =>
  Atom.make<SortKey>("id")
)

export const searchFocusedAtom = Atom.family((_key: string) =>
  Atom.make(false)
)
