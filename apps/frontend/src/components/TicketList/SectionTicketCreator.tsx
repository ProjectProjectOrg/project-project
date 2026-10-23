import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  GroupId,
  sprintSectionKey,
  type Group,
  type TicketListQuery,
  type TicketStatus
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Random from "effect/Random"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import {
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject
} from "react"

import { pickDefaultSprint } from "@/components/sprints/SprintAssignMenu"
import { comboboxProps } from "@/components/ui/menu-listbox"
import { me } from "@/features/auth/atoms/auth"
import {
  project as projectView,
  projectRequest
} from "@/features/projects/atoms/projects"
import {
  assignTicketToSprint,
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import {
  backlogRequest,
  quickCreateBacklogTicket,
  type BacklogRequest
} from "@/features/tickets/atoms/backlog"
import { quickCreateSprintSectionsTicket } from "@/features/tickets/atoms/sprintSections"
import { m } from "@/paraglide/messages"

import { creatorErrorText } from "./creatorError"
import { CreatorSprintMenu, CreatorTypeMenu } from "./CreatorMenus"
import { TemplateSlashList, useTemplateSlash } from "./TemplateSlashList"
import { useCreatorFocus } from "./useCreatorFocus"
import { useTemplateChoice, useTicketTypeChoice } from "./useTemplateChoice"

const isGroupId = Schema.is(GroupId)

export function SectionTicketCreator({
  orgSlug,
  slug,
  status,
  query,
  snapshotReq,
  variant = "status",
  containerRef,
  onDone
}: {
  orgSlug: string
  slug: string
  status: TicketStatus
  query: TicketListQuery
  snapshotReq?: BacklogRequest
  variant?: "status" | "flat"
  containerRef: RefObject<HTMLDivElement | null>
  onDone: () => void
}) {
  const registry = useContext(RegistryContext)
  const sectionsReq = useMemo(
    () => backlogRequest(orgSlug, slug, query),
    [orgSlug, slug, query]
  )
  const sprintReqForCreate = snapshotReq ?? sectionsReq
  const sprintKey = sprintSectionKey(
    isGroupId(query.groupId?.[0]) ? query.groupId[0] : null
  )
  const createSections = useAtomSet(quickCreateBacklogTicket(sectionsReq), {
    mode: "promiseExit"
  })
  const createSectionsState = useAtomValue(
    quickCreateBacklogTicket(sectionsReq)
  )
  const createSprint = useAtomSet(
    quickCreateSprintSectionsTicket({
      req: sprintReqForCreate,
      key: sprintKey
    }),
    { mode: "promiseExit" }
  )
  const createSprintState = useAtomValue(
    quickCreateSprintSectionsTicket({ req: sprintReqForCreate, key: sprintKey })
  )
  const create = variant === "flat" ? createSprint : createSections
  const createState =
    variant === "flat" ? createSprintState : createSectionsState
  const submitting = createState.waiting
  const error = Result.isFailure(createState)
    ? creatorErrorText(createState)
    : Result.isSuccess(createState) &&
        "sprintAssignmentFailed" in createState.value &&
        createState.value.sprintAssignmentFailed
      ? m.tickets_create_sprint_assignment_failed()
      : null

  const viewer = useAtomValue(me())
  const viewerId = Result.isSuccess(viewer) ? viewer.value.id : ""

  const project = useAtomValue(projectView(projectRequest(orgSlug, slug)))
  const projectPrefix = Result.isSuccess(project) ? project.value.key : "T"
  const estimation = Result.isSuccess(project)
    ? project.value.estimation
    : "off"

  const sprintReq = useMemo(
    () => sprintListRequest(orgSlug, slug),
    [orgSlug, slug]
  )
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

  const [title, setTitle] = useState("")
  const { type, setType, applyTemplateDefault } = useTicketTypeChoice()
  const [selectedSprint, setSelectedSprint] = useState<Group | null>(null)
  const [sprintCleared, setSprintCleared] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
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
  useCreatorFocus(containerRef, onDone)

  useEffect(() => {
    if (!showSprintAddon) return
    if (selectedSprint || sprintCleared) return
    const def = pickDefaultSprint(sprints)
    if (def) setSelectedSprint(def)
  }, [showSprintAddon, sprints, selectedSprint, sprintCleared])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    const submittedTitle = trimmed
    setTitle("")
    inputRef.current?.focus()
    const exit = await create({
      clientId: Effect.runSync(Random.next).toString(36),
      ticket: {
        title: submittedTitle,
        type,
        status,
        ...templateChoice.payload
      },
      viewerId,
      projectPrefix,
      estimation,
      prediction: templateChoice.prediction
    })
    if (Exit.isFailure(exit)) {
      templateChoice.recover(exit)
      setTitle(submittedTitle)
      return
    }
    const attachTo = activeSprintId ?? selectedSprint?.id ?? null
    if (attachTo !== null && variant !== "flat") {
      assignTicketToSprint(registry, sprintReq, exit.value.id, attachTo)
    }
  }

  const sprintAddon = showSprintAddon ? (
    <CreatorSprintMenu
      sprints={sprints}
      selected={selectedSprint}
      onSelectedChange={(s) => {
        setSelectedSprint(s)
        setSprintCleared(s === null)
      }}
      expanded
      inputRef={inputRef}
    />
  ) : null

  return (
    <form
      onSubmit={onSubmit}
      className="relative flex w-full items-center gap-2"
    >
      <CreatorTypeMenu
        type={type}
        onTypeChange={setType}
        expanded
        inputRef={inputRef}
      />

      {sprintAddon}

      <input
        ref={inputRef}
        type="text"
        {...comboboxProps(slash.listbox)}
        value={title}
        onChange={(e) => {
          slash.onTitleChange(title, e.target.value)
          setTitle(e.target.value)
        }}
        onKeyDown={slash.onKeyDown}
        placeholder={m.tickets_section_create_placeholder()}
        aria-label={m.tickets_section_create_placeholder()}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        readOnly={submitting}
        aria-disabled={submitting || undefined}
        maxLength={200}
        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground read-only:cursor-wait"
      />

      {error && (
        <span
          id={errorId}
          role="alert"
          className="shrink-0 text-xs text-destructive"
        >
          {error}
        </span>
      )}

      <TemplateSlashList slash={slash} choice={templateChoice} />
    </form>
  )
}
