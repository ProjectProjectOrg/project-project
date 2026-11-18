import type {
  ActivityCause,
  RelationSide,
  Estimate,
  GroupKind,
  TicketActivityChange,
  TicketActivityEntry,
  TicketPriority,
  TypeKey
} from "@pp/shared"
import * as Data from "effect/Data"

import { ActivityItem } from "@/features/tickets/lib/activityGroups"
import { formatEstimate } from "@/features/tickets/lib/estimateMeta"
import { m } from "@/paraglide/messages"

export type ActivityLiteralIcon =
  | "branch"
  | "stack"
  | "pr_opened"
  | "pr_merged"
  | "pr_closed"

export type ActivityValue = Data.TaggedEnum<{
  text: { readonly text: string }
  literal: { readonly text: string; readonly icon: ActivityLiteralIcon | null }
  status: { readonly slug: string }
  priority: { readonly priority: TicketPriority }
  type: { readonly type: TypeKey | null }
  group: { readonly groupKind: GroupKind; readonly name: string }
  people: { readonly ids: ReadonlyArray<string> }
  tags: { readonly names: ReadonlyArray<string> }
  ticket: { readonly id: string }
}>
export const ActivityValue = Data.taggedEnum<ActivityValue>()

export type ActivityLineBody = Data.TaggedEnum<{
  plain: { readonly text: string }
  verb: { readonly verb: string; readonly value: ActivityValue }
  field: {
    readonly label: string
    readonly from: ActivityValue
    readonly to: ActivityValue
  }
  quoted: { readonly text: string; readonly quote: string }
}>
export const ActivityLineBody = Data.taggedEnum<ActivityLineBody>()

export type ActivityLine = Readonly<{
  body: ActivityLineBody
  cause: string | null
}>

const CAUSES: Readonly<Record<ActivityCause, () => string>> = {
  status_removed: () => m.tickets_activity_cause_status_removed(),
  tag_deleted: () => m.tickets_activity_cause_tag_deleted(),
  member_removed: () => m.tickets_activity_cause_member_removed(),
  sprint_completed: () => m.tickets_activity_cause_sprint_completed(),
  group_deleted: () => m.tickets_activity_cause_group_deleted(),
  git_automation: () => m.tickets_activity_cause_git_automation()
}

const plain = (text: string) => ActivityLineBody.plain({ text })

const verb = (text: string, value: ActivityValue) =>
  ActivityLineBody.verb({ verb: text, value })

const quoted = (text: string, quote: string) =>
  ActivityLineBody.quoted({ text, quote })

const field = (label: string, from: ActivityValue, to: ActivityValue) =>
  ActivityLineBody.field({ label, from, to })

const literal = (text: string, icon: ActivityLiteralIcon | null = null) =>
  ActivityValue.literal({ text, icon })

const estimateValue = (estimate: Estimate | null) =>
  ActivityValue.text({
    text:
      estimate === null
        ? m.tickets_filters_estimate_none()
        : formatEstimate(estimate)
  })

const listLines = (
  added: ReadonlyArray<string>,
  removed: ReadonlyArray<string>,
  addedVerb: string,
  removedVerb: string,
  value: (items: ReadonlyArray<string>) => ActivityValue
) => [
  ...(added.length > 0 ? [verb(addedVerb, value(added))] : []),
  ...(removed.length > 0 ? [verb(removedVerb, value(removed))] : [])
]

const RELATION_ADDED: Readonly<Record<RelationSide, () => string>> = {
  blockedBy: () => m.tickets_activity_relation_added_blocked_by(),
  blocking: () => m.tickets_activity_relation_added_blocking(),
  related: () => m.tickets_activity_relation_added_related(),
  duplicateOf: () => m.tickets_activity_relation_added_duplicate_of(),
  duplicates: () => m.tickets_activity_relation_added_duplicates()
}

const RELATION_REMOVED: Readonly<Record<RelationSide, () => string>> = {
  blockedBy: () => m.tickets_activity_relation_removed_blocked_by(),
  blocking: () => m.tickets_activity_relation_removed_blocking(),
  related: () => m.tickets_activity_relation_removed_related(),
  duplicateOf: () => m.tickets_activity_relation_removed_duplicate_of(),
  duplicates: () => m.tickets_activity_relation_removed_duplicates()
}

const changeBodies = (change: TicketActivityChange) => {
  switch (change.kind) {
    case "title_changed":
      return [
        verb(
          m.tickets_activity_title_changed(),
          ActivityValue.text({ text: change.to })
        )
      ]
    case "status_changed":
      return [
        field(
          m.tickets_activity_field_status(),
          ActivityValue.status({ slug: change.from }),
          ActivityValue.status({ slug: change.to })
        )
      ]
    case "priority_changed":
      return [
        field(
          m.tickets_activity_field_priority(),
          ActivityValue.priority({ priority: change.from }),
          ActivityValue.priority({ priority: change.to })
        )
      ]
    case "type_changed":
      return [
        field(
          m.tickets_activity_field_type(),
          ActivityValue.type({ type: change.from }),
          ActivityValue.type({ type: change.to })
        )
      ]
    case "estimate_changed":
      return [
        field(
          m.tickets_activity_field_estimate(),
          estimateValue(change.from),
          estimateValue(change.to)
        )
      ]
    case "assignees_changed":
      return listLines(
        change.added,
        change.removed,
        m.tickets_activity_assignees_added(),
        m.tickets_activity_assignees_removed(),
        (ids) => ActivityValue.people({ ids })
      )
    case "tags_changed":
      return listLines(
        change.added,
        change.removed,
        m.tickets_activity_tags_added(),
        m.tickets_activity_tags_removed(),
        (names) => ActivityValue.tags({ names })
      )
    case "description_edited":
      return [plain(m.tickets_activity_description_edited())]
    case "archived":
      return [
        change.reason === undefined
          ? plain(m.tickets_activity_archived())
          : quoted(m.tickets_activity_archived(), change.reason)
      ]
    case "unarchived":
      return [plain(m.tickets_activity_unarchived())]
    case "flagged":
      return [
        change.reason === undefined
          ? plain(m.tickets_activity_flagged())
          : quoted(m.tickets_activity_flagged(), change.reason)
      ]
    case "unflagged":
      return [plain(m.tickets_activity_unflagged())]
    case "split":
      return [verb(m.tickets_activity_split(), literal(change.into.join(", ")))]
    case "moved":
      return [
        verb(
          m.tickets_activity_moved(),
          literal(`${change.fromProject} / ${change.fromId}`)
        )
      ]
    case "relation_added":
      return [
        verb(
          RELATION_ADDED[change.relation](),
          ActivityValue.ticket({ id: change.ticket })
        )
      ]
    case "relation_removed":
      return [
        verb(
          RELATION_REMOVED[change.relation](),
          ActivityValue.ticket({ id: change.ticket })
        )
      ]
    case "group_added":
      return [
        verb(
          m.tickets_activity_group_added(),
          ActivityValue.group({
            groupKind: change.groupKind,
            name: change.name
          })
        )
      ]
    case "group_removed":
      return [
        verb(
          m.tickets_activity_group_removed(),
          ActivityValue.group({
            groupKind: change.groupKind,
            name: change.name
          })
        )
      ]
    case "branch_linked":
      return [
        verb(
          m.tickets_activity_branch_linked(),
          literal(change.branch, "branch")
        )
      ]
    case "branch_unlinked":
      return [
        verb(
          m.tickets_activity_branch_unlinked(),
          literal(change.branch, "branch")
        )
      ]
    case "stack_branch_added":
      return [
        verb(
          m.tickets_activity_stack_branch_added(),
          literal(change.branch, "stack")
        )
      ]
    case "stack_branch_removed":
      return [
        verb(
          m.tickets_activity_stack_branch_removed(),
          literal(change.branch, "stack")
        )
      ]
    case "pr_opened":
      return [
        verb(
          m.tickets_activity_pr_opened(),
          literal(`#${change.number}`, "pr_opened")
        )
      ]
    case "pr_merged":
      return [
        verb(
          m.tickets_activity_pr_merged(),
          literal(`#${change.number}`, "pr_merged")
        )
      ]
  }
  return [
    verb(
      m.tickets_activity_pr_closed(),
      literal(`#${change.number}`, "pr_closed")
    )
  ]
}

const withCause = (
  bodies: ReadonlyArray<ActivityLineBody>,
  cause: ActivityCause | null
) => {
  const text = cause === null ? null : CAUSES[cause]()
  return bodies.map((body) => ({ body, cause: text }))
}

const entryLines = (entry: TicketActivityEntry) =>
  entry.kind === "created"
    ? withCause(
        [
          entry.splitFrom === null
            ? plain(m.tickets_activity_created())
            : verb(m.tickets_activity_split_from(), literal(entry.splitFrom))
        ],
        null
      )
    : withCause(changeBodies(entry.change), entry.cause)

export const activityLines = (item: ActivityItem) =>
  ActivityItem.$is("entry")(item)
    ? entryLines(item.entry)
    : withCause(
        [
          field(
            m.tickets_activity_field_sprint(),
            ActivityValue.group({ groupKind: "sprint", name: item.from }),
            ActivityValue.group({ groupKind: "sprint", name: item.to })
          )
        ],
        item.cause
      )
