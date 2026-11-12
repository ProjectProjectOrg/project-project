import {
  canHoldChildren,
  Validation,
  type TicketId,
  type TypeKey,
  isEpic,
  isEpicType
} from "@pp/shared"
import * as Effect from "effect/Effect"

export type HierarchyNode = Readonly<{
  id: TicketId
  type: TypeKey | null
  parent: TicketId | null
  archivedAt: Date | null
}>

export type HierarchyLookups = Readonly<{
  find: (id: TicketId) => Effect.Effect<HierarchyNode | undefined>
  hasChildren: (id: TicketId) => Effect.Effect<boolean>
}>

export type HierarchyChange = Readonly<{
  id: TicketId | null
  fromType: TypeKey | null
  type: TypeKey | null
  parent: TicketId | undefined
  parentChanged: boolean
}>

const invalidParent = (parent: TicketId) =>
  new Validation({ reason: `invalid_parent:${parent}` })

const validParent = (
  lookups: HierarchyLookups,
  childId: TicketId | null,
  parentId: TicketId
): Effect.Effect<HierarchyNode, Validation> =>
  Effect.gen(function* () {
    const parent = yield* lookups.find(parentId)
    if (
      parent === undefined ||
      parent.archivedAt !== null ||
      parent.id === childId
    ) {
      return yield* invalidParent(parentId)
    }
    const grandparent =
      parent.parent === null ? null : yield* lookups.find(parent.parent)
    if (!canHoldChildren(parent, grandparent)) {
      return yield* invalidParent(parentId)
    }
    return parent
  })

export const validateHierarchy = (
  lookups: HierarchyLookups,
  change: HierarchyChange
): Effect.Effect<void, Validation> =>
  Effect.gen(function* () {
    if (change.parent !== undefined && isEpic(change)) {
      return yield* new Validation({ reason: "epic_with_parent" })
    }
    const parent =
      change.parentChanged && change.parent !== undefined
        ? yield* validParent(lookups, change.id, change.parent)
        : null
    const becomesSubTicket = parent !== null && !isEpic(parent)
    const changesEpicness = isEpicType(change.fromType) !== isEpic(change)
    if (
      change.id !== null &&
      (becomesSubTicket || changesEpicness) &&
      (yield* lookups.hasChildren(change.id))
    ) {
      return yield* new Validation({
        reason: isEpicType(change.fromType)
          ? "epic_has_tickets"
          : "ticket_has_sub_tickets"
      })
    }
  })
