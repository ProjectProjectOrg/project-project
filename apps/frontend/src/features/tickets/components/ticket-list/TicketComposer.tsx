import {
  RegistryContext,
  useAtomRefresh,
  useAtomValue
} from "@effect/atom-react"
import { isEpic, isEpicType } from "@pp/shared"
import type { Group, Ticket, TicketParent } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Random from "effect/Random"
import * as Result from "effect/reactivity/AsyncResult"
import { useContext, useMemo, useRef, useState, type FormEvent } from "react"

import { AutoHeight } from "@/components/ui/auto-height"
import { currentUserId } from "@/features/auth/atoms/auth"
import { projectGitStates } from "@/features/github/atoms/github"
import {
  project as projectView,
  projectRequest
} from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  assignTicketToSprint,
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { pickDefaultSprint } from "@/features/sprints/components/SprintAssignMenu"
import { useCreatorType } from "@/features/tickets/hooks/useCreatorType"
import type { QuickCreateInput } from "@/features/tickets/lib/ticketRows"
import {
  mutationErrorText,
  ticketCreateErrorMessage
} from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import { CreatorSprintMenu, CreatorTypeMenu } from "./CreatorMenus"
import { StartsWithLine } from "./StartsWithLine"
import { TicketCreatorShell } from "./TicketCreatorShell"
import { useCreatorFocus } from "./useCreatorFocus"

type CreatorError = Readonly<{ _tag: string }>

export type TicketComposerProps = Readonly<{
  epics: boolean
  parent?: TicketParent
  create: (input: QuickCreateInput) => Promise<Exit.Exit<Ticket, CreatorError>>
  createState: Result.AsyncResult<unknown, CreatorError>
  onCreated?: (ticket: Ticket) => void
}>

export function TicketComposer({
  epics,
  parent,
  create,
  createState,
  onCreated
}: TicketComposerProps) {
  const { orgSlug, slug } = useProjectRoute()
  const registry = useContext(RegistryContext)
  const submitting = createState.waiting
  const error = mutationErrorText(
    createState,
    ticketCreateErrorMessage,
    m.tickets_create_error_fallback
  )
  const projectReq = projectRequest(orgSlug, slug)
  const refreshGitStates = useAtomRefresh(projectGitStates(projectReq))

  const viewerId = useAtomValue(currentUserId)

  const project = useAtomValue(projectView(projectReq))
  const projectPrefix = Result.isSuccess(project) ? project.value.key : "T"
  const estimation = Result.isSuccess(project)
    ? project.value.estimation
    : "off"

  const sprintReq = sprintListRequest(orgSlug, slug)
  const sprintListResult = useAtomValue(sprintList(sprintReq))
  const sprints = useMemo<ReadonlyArray<Group>>(
    () => (Result.isSuccess(sprintListResult) ? sprintListResult.value : []),
    [sprintListResult]
  )
  const hasSprints = sprints.some((s) => s.completedAt === null)

  const [title, setTitle] = useState("")
  const creatorType = useCreatorType({ orgSlug, slug, epics })
  const { type } = creatorType
  const [pickedSprint, setPickedSprint] = useState<Group | null>()
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const { active: expanded, leave } = useCreatorFocus(formRef)
  const trimmed = title.trim()

  const selectedSprint =
    pickedSprint === undefined
      ? (pickDefaultSprint(sprints) ?? null)
      : pickedSprint

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    inputRef.current?.blur()
    leave()
    const exit = await create({
      payload: { title: trimmed, ...creatorType.payload },
      parent,
      prediction: {
        clientId: Effect.runSync(Random.next).toString(36),
        createdBy: viewerId ?? "",
        projectPrefix,
        estimation,
        ...creatorType.prediction
      }
    })
    creatorType.settle(exit)
    if (Exit.isSuccess(exit)) {
      const ticket = exit.value
      if (selectedSprint && !isEpic(ticket)) {
        assignTicketToSprint(registry, sprintReq, ticket.id, selectedSprint.id)
      }
      setTitle("")
      refreshGitStates()
      onCreated?.(ticket)
    }
  }

  const typeAddon = (
    <CreatorTypeMenu
      type={type}
      lastUsed={creatorType.lastUsed}
      epics={epics}
      onTypeChange={creatorType.pick}
      expanded={expanded}
      inputRef={inputRef}
    />
  )

  const sprintAddon =
    hasSprints && !isEpicType(type) ? (
      <CreatorSprintMenu
        sprints={sprints}
        selected={selectedSprint}
        onSelectedChange={setPickedSprint}
        expanded={expanded}
        inputRef={inputRef}
      />
    ) : null

  return (
    <TicketCreatorShell
      inputRef={inputRef}
      formRef={formRef}
      shortcut="c"
      value={title}
      onValueChange={setTitle}
      onSubmit={onSubmit}
      expanded={expanded}
      placeholder={m.tickets_create_title_placeholder()}
      ariaLabel={m.tickets_create_title_aria_label()}
      busy={submitting}
      maxLength={200}
      error={error}
      listbox={null}
      leadingAddons={[typeAddon, sprintAddon].filter((addon) => addon !== null)}
      belowInput={
        <AutoHeight>
          {expanded && (
            <StartsWithLine start={creatorType.start} className="px-3 pt-1.5" />
          )}
        </AutoHeight>
      }
    />
  )
}
