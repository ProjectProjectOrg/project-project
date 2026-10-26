import type {
  ActivityCause,
  Estimate,
  GroupKind,
  TicketActivityChange,
  TicketActivityEntry,
  TicketPriority,
  TicketType
} from "@pp/shared"

import type { ActivityItem } from "@/features/tickets/lib/activityGroups"
import { formatEstimate } from "@/features/tickets/lib/estimateMeta"
import { m } from "@/paraglide/messages"

export type ActivityLiteralIcon =
  | "branch"
  | "stack"
  | "pr_opened"
  | "pr_merged"
  | "pr_closed"

export type ActivityValue =
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{
      kind: "literal"
      text: string
      icon: ActivityLiteralIcon | null
    }>
  | Readonly<{ kind: "status"; slug: string }>
  | Readonly<{ kind: "priority"; priority: TicketPriority }>
  | Readonly<{ kind: "type"; type: TicketType }>
  | Readonly<{ kind: "group"; groupKind: GroupKind; name: string }>
  | Readonly<{ kind: "people"; ids: ReadonlyArray<string> }>
  | Readonly<{ kind: "tags"; names: ReadonlyArray<string> }>

export type ActivityLineBody =
  | Readonly<{ kind: "plain"; text: string }>
  | Readonly<{ kind: "verb"; verb: string; value: ActivityValue }>
  | Readonly<{
      kind: "field"
      label: string
      from: ActivityValue
      to: ActivityValue
    }>
  | Readonly<{ kind: "quoted"; text: string; quote: string }>

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

const plain = (text: string): ActivityLineBody => ({ kind: "plain", text })

const verb = (text: string, value: ActivityValue): ActivityLineBody => ({
  kind: "verb",
  verb: text,
  value
})

const field = (
  label: string,
  from: ActivityValue,
  to: ActivityValue
): ActivityLineBody => ({ kind: "field", label, from, to })

const literal = (
  text: string,
  icon: ActivityLiteralIcon | null = null
): ActivityValue => ({ kind: "literal", text, icon })

const estimateValue = (estimate: Estimate | null): ActivityValue => ({
  kind: "text",
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
): ReadonlyArray<ActivityLineBody> => [
  ...(added.length > 0 ? [verb(addedVerb, value(added))] : []),
  ...(removed.length > 0 ? [verb(removedVerb, value(removed))] : [])
]

const changeBodies = (
  change: TicketActivityChange
): ReadonlyArray<ActivityLineBody> => {
  switch (change.kind) {
    case "title_changed":
      return [
        verb(m.tickets_activity_title_changed(), {
          kind: "text",
          text: change.to
        })
      ]
    case "status_changed":
      return [
        field(
          m.tickets_activity_field_status(),
          { kind: "status", slug: change.from },
          { kind: "status", slug: change.to }
        )
      ]
    case "priority_changed":
      return [
        field(
          m.tickets_activity_field_priority(),
          { kind: "priority", priority: change.from },
          { kind: "priority", priority: change.to }
        )
      ]
    case "type_changed":
      return [
        field(
          m.tickets_activity_field_type(),
          { kind: "type", type: change.from },
          { kind: "type", type: change.to }
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
        (ids) => ({ kind: "people", ids })
      )
    case "tags_changed":
      return listLines(
        change.added,
        change.removed,
        m.tickets_activity_tags_added(),
        m.tickets_activity_tags_removed(),
        (names) => ({ kind: "tags", names })
      )
    case "description_edited":
      return [plain(m.tickets_activity_description_edited())]
    case "archived":
      return [
        change.reason === undefined
          ? plain(m.tickets_activity_archived())
          : {
              kind: "quoted",
              text: m.tickets_activity_archived(),
              quote: change.reason
            }
      ]
    case "unarchived":
      return [plain(m.tickets_activity_unarchived())]
    case "split":
      return [verb(m.tickets_activity_split(), literal(change.into.join(", ")))]
    case "group_added":
      return [
        verb(m.tickets_activity_group_added(), {
          kind: "group",
          groupKind: change.groupKind,
          name: change.name
        })
      ]
    case "group_removed":
      return [
        verb(m.tickets_activity_group_removed(), {
          kind: "group",
          groupKind: change.groupKind,
          name: change.name
        })
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
): ReadonlyArray<ActivityLine> => {
  const text = cause === null ? null : CAUSES[cause]()
  return bodies.map((body) => ({ body, cause: text }))
}

const entryLines = (entry: TicketActivityEntry): ReadonlyArray<ActivityLine> =>
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

export const activityLines = (
  item: ActivityItem
): ReadonlyArray<ActivityLine> =>
  item.kind === "entry"
    ? entryLines(item.entry)
    : withCause(
        [
          field(
            m.tickets_activity_field_sprint(),
            { kind: "group", groupKind: "sprint", name: item.from },
            { kind: "group", groupKind: "sprint", name: item.to }
          )
        ],
        item.cause
      )
