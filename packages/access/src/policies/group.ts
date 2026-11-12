import type { PolicyActor } from "./actor"

export type Kind = "sprint" | "milestone" | "epic" | "other"

export type Action = "manage" | "add_ticket" | "remove_ticket"

export type TicketsChange = Readonly<{
  current: ReadonlyArray<string>
  next: ReadonlyArray<string>
  evicts: boolean
}>

export const can = (actor: PolicyActor, kind: Kind, action: Action) =>
  actor.permissions.can(
    kind === "sprint" || kind === "milestone"
      ? { sprint: [action] }
      : { epic: ["manage"] }
  )

export const ticketActions = (
  current: ReadonlyArray<string>,
  next: ReadonlyArray<string>
) => {
  const before = new Set(current)
  const after = new Set(next)
  return [
    ...(next.some((id) => !before.has(id)) ? (["add_ticket"] as const) : []),
    ...(current.some((id) => !after.has(id))
      ? (["remove_ticket"] as const)
      : [])
  ]
}

export const canChangeTickets = (
  actor: PolicyActor,
  kind: Kind,
  change: TicketsChange
) =>
  [
    ...ticketActions(change.current, change.next),
    ...(change.evicts ? (["remove_ticket"] as const) : [])
  ].every((action) => can(actor, kind, action))
