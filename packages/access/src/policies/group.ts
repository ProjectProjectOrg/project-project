import type { ProjectActor } from "./actor"

export type Kind = "sprint" | "milestone" | "epic" | "other"

export type Action = "manage" | "add_ticket" | "remove_ticket" | "reorder"

export type TicketsChange = Readonly<{
  current: ReadonlyArray<string>
  next: ReadonlyArray<string>
  evicts: boolean
}>

export const can = (actor: ProjectActor, kind: Kind, action: Action) =>
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
  const kept = current.filter((id) => after.has(id))
  const keptOrder = next.filter((id) => before.has(id))
  return [
    ...(next.some((id) => !before.has(id)) ? (["add_ticket"] as const) : []),
    ...(kept.length < current.length ? (["remove_ticket"] as const) : []),
    ...(kept.some((id, index) => keptOrder[index] !== id)
      ? (["reorder"] as const)
      : [])
  ]
}

export const canChangeTickets = (
  actor: ProjectActor,
  kind: Kind,
  change: TicketsChange
) =>
  [
    ...ticketActions(change.current, change.next),
    ...(change.evicts ? (["remove_ticket"] as const) : [])
  ].every((action) => can(actor, kind, action))
