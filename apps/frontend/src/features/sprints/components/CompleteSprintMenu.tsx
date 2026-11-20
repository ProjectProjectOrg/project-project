import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  finishedStatusSlugs,
  isCarryover,
  pickEarliestPlannedSprint,
  type CompleteSprintDestination,
  type Group
} from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { ChevronDown, Inbox, Plus, Trophy } from "@pp/ui/icons"
import * as Result from "effect/reactivity/AsyncResult"
import { useRef, useState } from "react"

import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { boardRequest, sprintBoard } from "@/features/sprints/atoms/sprintBoard"
import {
  completeSprint,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { m } from "@/paraglide/messages"

import { NewSprintPopover } from "./NewSprintPopover"
import { SprintStateIcon } from "./SprintChip"

export function useUnfinishedCount({
  orgSlug,
  slug,
  sprint
}: Readonly<{ orgSlug: string; slug: string; sprint: Group }>) {
  const board = useAtomValue(
    sprintBoard(boardRequest(orgSlug, slug, sprint.id))
  )
  const statuses = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  if (!Result.isSuccess(board) || !Result.isSuccess(statuses)) return null
  const finished = finishedStatusSlugs(statuses.value)
  return board.value.tickets.filter((ticket) =>
    isCarryover(ticket.status, finished)
  ).length
}

export type SprintPair = Readonly<{
  sprint: Group
  sprints: ReadonlyArray<Group>
}>

export function useCompleteSprint({
  orgSlug,
  slug,
  sprint,
  sprints,
  onNew
}: SprintPair &
  Readonly<{
    orgSlug: string
    slug: string
    // "Complete into a new sprint": on the page this opens the new-sprint
    // popover on the menu's button; in cmd+k it opens the New sprint page.
    onNew: () => void
  }>) {
  const mutation = completeSprint({
    req: sprintListRequest(orgSlug, slug),
    groupId: sprint.id
  })
  const complete = useAtomSet(mutation)
  const unfinished = useUnfinishedCount({ orgSlug, slug, sprint })
  const others = sprints.filter(
    (other) => other.id !== sprint.id && other.completedAt === null
  )
  const next = pickEarliestPlannedSprint(others)
  const targets =
    next === null ? others : [next, ...others.filter((other) => other !== next)]
  const completeTo = (destination: CompleteSprintDestination) =>
    complete({ destination })
  const completeToNew = onNew
  return { unfinished, targets, completeTo, completeToNew }
}

type CompleteAction = ReturnType<typeof useCompleteSprint>

function DestinationItems({ action }: Readonly<{ action: CompleteAction }>) {
  const { unfinished, targets, completeTo, completeToNew } = action
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>
        {unfinished === null
          ? m.sprints_complete_move_label()
          : m.sprints_complete_move_count({ count: unfinished })}
      </DropdownMenuLabel>
      <DropdownMenuItem
        onClick={() => completeTo({ kind: "backlog" })}
        className="cursor-pointer"
      >
        <Inbox className="size-4" strokeWidth={1.75} />
        {m.sprints_complete_backlog_option()}
      </DropdownMenuItem>
      {targets.map((target) => (
        <DropdownMenuItem
          key={target.id}
          onClick={() => completeTo({ kind: "sprint", groupId: target.id })}
          className="cursor-pointer"
        >
          <SprintStateIcon sprint={target} size="md" />
          <span className="truncate">{target.name}</span>
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem onClick={completeToNew} className="cursor-pointer">
        <Plus className="size-4" strokeWidth={1.75} />
        <span className="truncate">{m.sprints_complete_new_option()}</span>
      </DropdownMenuItem>
    </DropdownMenuGroup>
  )
}

const trophy = (
  <Trophy className="size-4 text-state-success" strokeWidth={1.75} />
)

export function CompleteSprintSubmenu(
  props: SprintPair & Readonly<{ onNew: () => void }>
) {
  const action = useCompleteSprint({ ...useProjectRoute(), ...props })
  if (action.unfinished === 0) {
    return (
      <DropdownMenuItem
        onClick={() => action.completeTo({ kind: "backlog" })}
        className="cursor-pointer"
      >
        {trophy}
        {m.sprints_complete_button()}
      </DropdownMenuItem>
    )
  }
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {trophy}
        {m.sprints_complete_button()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-60">
        <DestinationItems action={action} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

export function CompleteSprintButton(props: SprintPair) {
  const [creating, setCreating] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const action = useCompleteSprint({
    ...useProjectRoute(),
    ...props,
    onNew: () => setCreating(true)
  })
  if (action.unfinished === 0) {
    return (
      <Button
        type="button"
        variant="tertiary"
        size="sm"
        leadingIcon={Trophy}
        onClick={() => action.completeTo({ kind: "backlog" })}
      >
        {m.sprints_complete_button()}
      </Button>
    )
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={button}
              type="button"
              variant="tertiary"
              size="sm"
              leadingIcon={Trophy}
              trailingIcon={ChevronDown}
            >
              {m.sprints_complete_button()}
            </Button>
          }
        />
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          finalFocus={false}
          className="w-60"
        >
          <DestinationItems action={action} />
        </DropdownMenuContent>
      </DropdownMenu>
      <NewSprintPopover
        anchor={button}
        open={creating}
        onOpenChange={setCreating}
        completeFrom={props.sprint}
      />
    </>
  )
}
