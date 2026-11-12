import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  EPIC_SECTION_NONE,
  GroupId,
  sprintSectionKey,
  type Group,
  type TicketId,
  type TicketListQuery,
  type TicketStatus,
  type TicketParent,
  isEpicType
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Random from "effect/Random"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import {
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject
} from "react"

import { currentUserId } from "@/features/auth/atoms/auth"
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
  quickCreateEpicSectionsTicket,
  type EpicSectionsRequest
} from "@/features/tickets/atoms/epicSections"
import {
  quickCreateSprintSectionsTicket,
  type SprintSectionsRequest
} from "@/features/tickets/atoms/sprintSections"
import { useCreatorType } from "@/features/tickets/hooks/useCreatorType"
import type { QuickCreateInput } from "@/features/tickets/lib/ticketRows"
import {
  mutationErrorText,
  ticketCreateErrorMessage
} from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import { CreatorSprintMenu, CreatorTypeMenu } from "./CreatorMenus"
import { StartsWithLine } from "./StartsWithLine"
import { useCreatorFocus } from "./useCreatorFocus"

const isGroupId = Schema.is(GroupId)

type CreatorProps = Readonly<{
  status: TicketStatus
  parent?: TicketParent
  query: TicketListQuery
  containerRef: RefObject<HTMLDivElement | null>
  onDone: () => void
}>

type CreatedTicket = Readonly<{
  id: TicketId
  sprintAssignmentFailed?: boolean
}>

type CreateTicket = (
  input: QuickCreateInput
) => Promise<Exit.Exit<CreatedTicket, Readonly<{ _tag: string }>>>

export function SectionTicketCreator({
  snapshotReq,
  ...props
}: CreatorProps &
  Readonly<{ snapshotReq?: SprintSectionsRequest | EpicSectionsRequest }>) {
  if (snapshotReq?._view === "epicSections") {
    return <EpicSectionTicketCreator {...props} req={snapshotReq} />
  }
  return snapshotReq ? (
    <SprintSectionTicketCreator {...props} req={snapshotReq} />
  ) : (
    <StatusSectionTicketCreator {...props} />
  )
}

function StatusSectionTicketCreator(props: CreatorProps) {
  const { orgSlug, slug } = useProjectRoute()
  const { query } = props
  const req = backlogRequest(orgSlug, slug, query)
  const create = useAtomSet(quickCreateBacklogTicket(req), {
    mode: "promiseExit"
  })
  const state = useAtomValue(quickCreateBacklogTicket(req))
  return (
    <SectionCreatorForm
      {...props}
      create={create}
      submitting={state.waiting}
      error={mutationErrorText(
        state,
        ticketCreateErrorMessage,
        m.tickets_create_error_fallback
      )}
      assignsSprint
    />
  )
}

function SprintSectionTicketCreator(
  props: CreatorProps & Readonly<{ req: SprintSectionsRequest }>
) {
  const { req, query } = props
  const key = sprintSectionKey(
    isGroupId(query.groupId?.[0]) ? query.groupId[0] : null
  )
  const create = useAtomSet(quickCreateSprintSectionsTicket({ req, key }), {
    mode: "promiseExit"
  })
  const state = useAtomValue(quickCreateSprintSectionsTicket({ req, key }))
  const error = Result.isFailure(state)
    ? mutationErrorText(
        state,
        ticketCreateErrorMessage,
        m.tickets_create_error_fallback
      )
    : Result.isSuccess(state) && state.value.sprintAssignmentFailed
      ? m.tickets_create_sprint_assignment_failed()
      : null
  return (
    <SectionCreatorForm
      {...props}
      create={create}
      submitting={state.waiting}
      error={error}
      assignsSprint={false}
    />
  )
}

function EpicSectionTicketCreator(
  props: CreatorProps & Readonly<{ req: EpicSectionsRequest }>
) {
  const { req, query } = props
  const key = query.parent?.[0] ?? EPIC_SECTION_NONE
  const create = useAtomSet(quickCreateEpicSectionsTicket({ req, key }), {
    mode: "promiseExit"
  })
  const state = useAtomValue(quickCreateEpicSectionsTicket({ req, key }))
  return (
    <SectionCreatorForm
      {...props}
      create={create}
      submitting={state.waiting}
      error={mutationErrorText(
        state,
        ticketCreateErrorMessage,
        m.tickets_create_error_fallback
      )}
      assignsSprint
    />
  )
}

function SectionCreatorForm({
  status,
  query,
  containerRef,
  onDone,
  create,
  submitting,
  error,
  assignsSprint,
  parent
}: CreatorProps &
  Readonly<{
    create: CreateTicket
    submitting: boolean
    error: string | null
    assignsSprint: boolean
  }>) {
  const { orgSlug, slug } = useProjectRoute()
  const registry = useContext(RegistryContext)

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

  const groupIdFilter = query.groupId
  const singleGroupIdFilter =
    groupIdFilter && groupIdFilter.length === 1 ? groupIdFilter[0] : undefined
  const activeSprintId = isGroupId(singleGroupIdFilter)
    ? singleGroupIdFilter
    : null
  const isExplicitNoSprintFilter = singleGroupIdFilter === "ungrouped"
  const hasSprints = sprints.some((s) => s.completedAt === null)
  const showSprintAddon =
    activeSprintId === null && !isExplicitNoSprintFilter && hasSprints
  const epics = activeSprintId === null && parent === undefined

  const [title, setTitle] = useState("")
  const creatorType = useCreatorType({ orgSlug, slug, epics })
  const { type } = creatorType
  const [pickedSprint, setPickedSprint] = useState<Group | null>()
  const inputRef = useRef<HTMLInputElement>(null)
  const focusOnMount = useCallback((input: HTMLInputElement | null) => {
    inputRef.current = input
    input?.focus()
  }, [])
  const errorId = useId()
  const trimmed = title.trim()
  useCreatorFocus(containerRef, onDone)

  const selectedSprint =
    pickedSprint === undefined
      ? showSprintAddon
        ? (pickDefaultSprint(sprints) ?? null)
        : null
      : pickedSprint

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    const submittedTitle = trimmed
    setTitle("")
    inputRef.current?.focus()
    const exit = await create({
      payload: {
        title: submittedTitle,
        status,
        ...creatorType.payload
      },
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
    if (Exit.isFailure(exit)) {
      setTitle(submittedTitle)
      return
    }
    const attachTo = activeSprintId ?? selectedSprint?.id ?? null
    if (attachTo !== null && assignsSprint && !isEpicType(type)) {
      assignTicketToSprint(registry, sprintReq, exit.value.id, attachTo)
    }
  }

  const sprintAddon =
    showSprintAddon && !isEpicType(type) ? (
      <CreatorSprintMenu
        sprints={sprints}
        selected={selectedSprint}
        onSelectedChange={setPickedSprint}
        expanded
        inputRef={inputRef}
      />
    ) : null

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-1">
      <div className="flex w-full items-center gap-2">
        <CreatorTypeMenu
          type={type}
          lastUsed={creatorType.lastUsed}
          epics={epics}
          onTypeChange={creatorType.pick}
          expanded
          inputRef={inputRef}
        />

        {sprintAddon}

        <input
          ref={focusOnMount}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return
            e.preventDefault()
            e.currentTarget.form?.requestSubmit()
          }}
          placeholder={m.tickets_section_create_placeholder()}
          aria-label={m.tickets_section_create_placeholder()}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          readOnly={submitting}
          aria-disabled={submitting || undefined}
          maxLength={200}
          className="min-w-0 flex-1 bg-transparent text-body font-semibold text-foreground outline-none placeholder:text-muted-foreground read-only:cursor-wait"
        />

        {error && (
          <span
            id={errorId}
            role="alert"
            className="shrink-0 text-caption text-destructive"
          >
            {error}
          </span>
        )}
      </div>
      <StartsWithLine start={creatorType.start} className="pl-1" />
    </form>
  )
}
