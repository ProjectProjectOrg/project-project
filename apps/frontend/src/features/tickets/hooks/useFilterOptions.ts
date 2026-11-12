import { useAtomValue } from "@effect/atom-react"
import {
  sprintState,
  TicketType,
  type Member,
  type TicketFilter,
  ticketRule
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"
import {
  Archive,
  Gauge,
  OctagonMinus,
  Shapes,
  Tag,
  Timer,
  UserMinus,
  UserRound
} from "lucide-react"

import { currentUserId } from "@/features/auth/atoms/auth"
import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { SPRINT_STATE_META } from "@/features/sprints/components/SprintChip"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import type { FilterDimension } from "@/features/tickets/components/ticket-list/toolbar/model"
import {
  estimateFilterLabel,
  estimateFilterValues
} from "@/features/tickets/lib/estimateMeta"
import {
  isChosen,
  type FilterChoice,
  type FilterChoiceDimension
} from "@/features/tickets/lib/filterChoices"
import { filterableSprints } from "@/features/tickets/lib/ticketFilters"
import { TYPE_LABELS, TYPE_META } from "@/features/tickets/lib/ticketMeta"
import type { IconComponent } from "@/lib/icon"
import { m } from "@/paraglide/messages"

export type FilterVisual =
  | Readonly<{
      kind: "icon"
      icon: IconComponent
      className?: string
      color?: string
    }>
  | Readonly<{ kind: "color"; color: string }>
  | Readonly<{ kind: "member"; member: Member }>

export type FilterOption = Readonly<{
  key: string
  choice: FilterChoice
  label: string
  icon: IconComponent
  visual?: FilterVisual
  chosen: boolean
}>

export const FILTER_DIMENSION_META: Readonly<
  Record<
    FilterChoiceDimension,
    Readonly<{ label: () => string; icon: IconComponent }>
  >
> = {
  blocked: { label: m.tickets_filters_blocked, icon: OctagonMinus },
  archived: { label: m.tickets_filters_section_archived, icon: Archive },
  type: { label: m.tickets_filters_section_type, icon: Shapes },
  assignee: { label: m.tickets_filters_section_assignee, icon: UserRound },
  sprint: { label: m.tickets_filters_section_sprint, icon: Timer },
  estimate: { label: m.tickets_filters_section_estimate, icon: Gauge },
  tags: { label: m.tickets_filters_section_tags, icon: Tag }
}

type Draft = Omit<FilterOption, "key" | "chosen">

export function useFilterOptions(
  dimensions: ReadonlyArray<FilterDimension>,
  filter: TicketFilter
): ReadonlyArray<FilterOption> {
  const { orgSlug, slug } = useProjectRoute()
  const project = useProject()
  const viewerId = useAtomValue(currentUserId)
  const tagsResult = useAtomValue(tagsFor(tagsRequest(orgSlug, slug)))
  const sprintsResult = useAtomValue(
    sprintList(sprintListRequest(orgSlug, slug))
  )
  const tags = Result.isSuccess(tagsResult) ? tagsResult.value : []
  const now = DateTime.toDate(DateTime.nowUnsafe())
  const sprints = Result.isSuccess(sprintsResult)
    ? filterableSprints(
        sprintsResult.value,
        now,
        ticketRule(filter, "sprint")?.values
      )
    : []

  const drafts = (dimension: FilterDimension): ReadonlyArray<Draft> => {
    switch (dimension) {
      case "blocked":
        return [
          {
            choice: { dimension },
            label:
              ticketRule(filter, "blocked")?.operator === "isNot"
                ? m.tickets_filters_ticket_not_blocked()
                : m.tickets_filters_blocked_only(),
            icon: OctagonMinus
          }
        ]
      case "archived":
        return [
          {
            choice: { dimension },
            label:
              ticketRule(filter, "archived")?.operator === "isNot"
                ? m.tickets_filters_ticket_not_archived()
                : m.tickets_filters_archived_show(),
            icon: Archive
          }
        ]
      case "type":
        return TicketType.literals.map((value) => ({
          choice: { dimension, value },
          label: TYPE_LABELS[value](),
          icon: TYPE_META[value].icon,
          visual: { kind: "icon", icon: TYPE_META[value].icon }
        }))
      case "assignee":
        return [
          ...(viewerId
            ? [
                {
                  choice: { dimension, value: "mine" },
                  label: m.tickets_filters_assignee_mine(),
                  icon: UserRound,
                  visual: { kind: "icon", icon: UserRound }
                } satisfies Draft
              ]
            : []),
          {
            choice: { dimension, value: "unassigned" },
            label: m.tickets_filters_assignee_unassigned(),
            icon: UserMinus,
            visual: { kind: "icon", icon: UserMinus }
          },
          ...project.members.map((member) => ({
            choice: { dimension, value: member.id },
            label: member.name,
            icon: UserRound,
            visual: { kind: "member", member }
          }) satisfies Draft)
        ]
      case "sprint":
        return [
          {
            choice: { dimension, value: "ungrouped" },
            label: m.tickets_filters_sprint_none(),
            icon: Timer,
            visual: { kind: "icon", icon: Timer }
          },
          ...sprints.map((sprint) => ({
            choice: { dimension, value: sprint.id },
            label: sprint.name,
            icon: Timer,
            visual: {
              kind: "icon",
              ...SPRINT_STATE_META[sprintState(sprint, now)]
            }
          }) satisfies Draft)
        ]
      case "estimate":
        return estimateFilterValues(project.estimation).map((value) => ({
          choice: { dimension, value },
          label: estimateFilterLabel(value),
          icon: Gauge
        }))
      case "tags":
        return tags.map((tag) => ({
          choice: { dimension, value: tag.name },
          label: tag.name,
          icon: Tag,
          visual: { kind: "color", color: tag.color }
        }))
    }
  }

  return dimensions.flatMap((dimension) =>
    drafts(dimension).map(({ choice, label, icon, visual }) => ({
      key: `${choice.dimension}:${"value" in choice ? choice.value : ""}`,
      choice,
      label,
      icon,
      visual,
      chosen: isChosen(filter, choice)
    }))
  )
}
