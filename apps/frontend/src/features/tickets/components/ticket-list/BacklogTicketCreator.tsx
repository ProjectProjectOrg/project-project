import {
  RegistryContext,
  useAtomRefresh,
  useAtomSet,
  useAtomValue
} from "@effect/atom-react"
import type { Group, TicketListQuery } from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Random from "effect/Random"
import * as Result from "effect/reactivity/AsyncResult"
import { useContext, useMemo, useRef, useState, type FormEvent } from "react"

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
import {
  backlogRequest,
  quickCreateBacklogTicket
} from "@/features/tickets/atoms/backlog"
import {
  mutationErrorText,
  ticketCreateErrorMessage
} from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import { CreatorSprintMenu, CreatorTypeMenu } from "./CreatorMenus"
import { TemplateSlashList, useTemplateSlash } from "./TemplateSlashList"
import { TicketCreatorShell } from "./TicketCreatorShell"
import { useCreatorFocus } from "./useCreatorFocus"
import { useTemplateChoice, useTicketTypeChoice } from "./useTemplateChoice"

export function BacklogTicketCreator({ query }: { query: TicketListQuery }) {
  const { orgSlug, slug } = useProjectRoute()
  const registry = useContext(RegistryContext)
  const req = backlogRequest(orgSlug, slug, query)
  const create = useAtomSet(quickCreateBacklogTicket(req), {
    mode: "promiseExit"
  })
  const createState = useAtomValue(quickCreateBacklogTicket(req))
  const submitting = createState.waiting
  const error = mutationErrorText(
    createState,
    ticketCreateErrorMessage,
    m.tickets_create_error_fallback
  )
  const projectReq = projectRequest(orgSlug, slug)
  const refreshGitStates = useAtomRefresh(projectGitStates(projectReq))
  const navigate = useNavigate()

  const viewerId = useAtomValue(currentUserId)

  const project = useAtomValue(projectView(projectRequest(orgSlug, slug)))
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
  const { type, setType, applyTemplateDefault } = useTicketTypeChoice()
  const [pickedSprint, setPickedSprint] = useState<Group | null>()
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const { active: expanded, leave } = useCreatorFocus(formRef)
  const trimmed = title.trim()
  const templateChoice = useTemplateChoice(orgSlug, slug, type)
  const slash = useTemplateSlash({
    title,
    choice: templateChoice,
    onChoose: (_template, ticketType) => {
      setTitle("")
      if (ticketType !== null) applyTemplateDefault(ticketType)
    }
  })

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
      payload: { title: trimmed, type, ...templateChoice.payload },
      prediction: {
        clientId: Effect.runSync(Random.next).toString(36),
        createdBy: viewerId ?? "",
        projectPrefix,
        estimation,
        ...templateChoice.prediction
      }
    })
    templateChoice.recover(exit)
    if (Exit.isSuccess(exit)) {
      const ticket = exit.value
      if (selectedSprint) {
        assignTicketToSprint(registry, sprintReq, ticket.id, selectedSprint.id)
      }
      setTitle("")
      refreshGitStates()
      void navigate({
        to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
        params: { orgSlug, slug, id: ticket.id },
        search: { focusBody: 1 }
      })
    }
  }

  const typeAddon = (
    <CreatorTypeMenu
      type={type}
      onTypeChange={setType}
      expanded={expanded}
      inputRef={inputRef}
    />
  )

  const sprintAddon = hasSprints ? (
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
      onValueChange={(next) => {
        slash.onTitleChange(title, next)
        setTitle(next)
      }}
      onBlur={slash.close}
      onKeyDown={(e) => {
        slash.onKeyDown(e)
      }}
      onSubmit={onSubmit}
      expanded={expanded}
      placeholder={m.tickets_create_title_placeholder()}
      ariaLabel={m.tickets_create_title_aria_label()}
      busy={submitting}
      maxLength={200}
      error={error}
      listbox={slash.listbox}
      leadingAddons={[typeAddon, sprintAddon].filter((addon) => addon !== null)}
      belowInput={<TemplateSlashList slash={slash} choice={templateChoice} />}
    />
  )
}
