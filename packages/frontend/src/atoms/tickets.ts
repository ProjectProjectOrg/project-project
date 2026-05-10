import { Atom, Result } from "@effect-atom/atom-react"
import { ReactivityKey } from "@/atoms/reactivity-keys"
import {
  ticketKey,
  ticketsListKey,
  type ProjectKey,
  type TicketKey
} from "@/atoms/keys"
import { AppApiClient } from "@/services/AppApiClient"

export { ticketKey, ticketsListKey }
export type { ProjectKey, TicketKey }

export const ticketsListAtom = Atom.family(({ orgSlug, slug }: ProjectKey) =>
  AppApiClient.query("tickets", "list", {
    path: { orgSlug, slug },
    reactivityKeys: [ReactivityKey.tickets]
  })
)

const ticketBaseAtom = Atom.family(({ orgSlug, slug, id }: TicketKey) =>
  AppApiClient.query("tickets", "get", {
    path: { orgSlug, slug, id },
    reactivityKeys: [ReactivityKey.tickets]
  })
)

export const ticketAtom = Atom.family((key: TicketKey) =>
  Atom.optimistic(ticketBaseAtom(key))
)

export const updateTicketAtom = Atom.family((key: TicketKey) =>
  ticketAtom(key).pipe(
    Atom.optimisticFn({
      reducer: (current, arg) => {
        if (!Result.isSuccess(current)) return current
        return Result.success(
          { ...current.value, ...arg.payload } as typeof current.value,
          { waiting: true }
        )
      },
      fn: AppApiClient.mutation("tickets", "update")
    })
  )
)

export const deleteTicketAtom = Atom.family((_key: TicketKey) =>
  AppApiClient.mutation("tickets", "delete")
)

export const createTicketAtom = Atom.family((_key: ProjectKey) =>
  AppApiClient.mutation("tickets", "create")
)
