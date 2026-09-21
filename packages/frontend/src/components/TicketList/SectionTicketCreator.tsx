import * as Random from "effect/Random"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import { Plus } from "lucide-react"
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject
} from "react"
import { CollapsingLabel } from "@/components/SegmentedTabs"
import { SprintStateIcon } from "@/components/sprints/SprintChip"
import {
  pickDefaultSprint,
  SprintAssignMenu
} from "@/components/sprints/SprintAssignMenu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { BADGE_TONES } from "@/components/ui/badge"
import {
  backlogRequest,
  quickCreateBacklogTicket
} from "@/atoms/backlog"
import { me } from "@/atoms/auth"
import { project as projectView, projectRequest } from "@/atoms/projects"
import {
  assignTicketToSprint,
  sprintList,
  sprintListRequest
} from "@/atoms/sprintList"
import {
  quickCreateSprintSectionsTicket,
  sprintSectionsRequest
} from "@/atoms/sprintSections"
import { cn } from "@/lib/utils"
import { TYPE_LABELS, TYPE_META } from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"
import {
  GroupId,
  sprintSectionKey,
  type Group,
  type TicketListQuery,
  type TicketStatus,
  type TicketType
} from "@projectproject/shared"

export function SectionTicketCreator({
  orgSlug,
  slug,
  status,
  query,
  variant = "status",
  containerRef,
  onDone
}: {
  orgSlug: string
  slug: string
  status: TicketStatus
  query: TicketListQuery
  variant?: "status" | "flat"
  containerRef: RefObject<HTMLDivElement | null>
  onDone: () => void
}) {
  const registry = useContext(RegistryContext)
  const sectionsReq = useMemo(
    () => backlogRequest(orgSlug, slug, query),
    [orgSlug, slug, query]
  )
  const sprintReqForCreate = useMemo(
    () => sprintSectionsRequest(orgSlug, slug, query),
    [orgSlug, slug, query]
  )
  const sprintKey = sprintSectionKey(
    Schema.is(GroupId)(query.groupId?.[0]) ? query.groupId[0] : null
  )
  const createSections = useAtomSet(quickCreateBacklogTicket(sectionsReq), {
    mode: "promiseExit"
  })
  const createSectionsState = useAtomValue(
    quickCreateBacklogTicket(sectionsReq)
  )
  const createSprint = useAtomSet(
    quickCreateSprintSectionsTicket({ req: sprintReqForCreate, key: sprintKey }),
    { mode: "promiseExit" }
  )
  const createSprintState = useAtomValue(
    quickCreateSprintSectionsTicket({ req: sprintReqForCreate, key: sprintKey })
  )
  const create = variant === "flat" ? createSprint : createSections
  const createState = variant === "flat" ? createSprintState : createSectionsState
  const submitting = createState.waiting
  const error = Result.isFailure(createState)
    ? m.tickets_create_error_fallback()
    : Result.isSuccess(createState) &&
        "sprintAssignmentFailed" in createState.value &&
        createState.value.sprintAssignmentFailed
      ? m.tickets_create_sprint_assignment_failed()
      : null

  const viewer = useAtomValue(me())
  const viewerId = Result.isSuccess(viewer) ? viewer.value.id : ""

  const project = useAtomValue(projectView(projectRequest(orgSlug, slug)))
  const projectPrefix = Result.isSuccess(project) ? project.value.key : "T"

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
  const activeSprintId = Schema.is(GroupId)(singleGroupIdFilter)
    ? singleGroupIdFilter
    : null
  const isExplicitNoSprintFilter = singleGroupIdFilter === "ungrouped"
  const hasSprints = sprints.some((s) => s.completedAt === null)
  const showSprintAddon =
    activeSprintId === null && !isExplicitNoSprintFilter && hasSprints

  const [title, setTitle] = useState("")
  const [type, setType] = useState<TicketType>("other")
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
  const [sprintMenuOpen, setSprintMenuOpen] = useState(false)
  const [selectedSprint, setSelectedSprint] = useState<Group | null>(null)
  const [sprintCleared, setSprintCleared] = useState(false)
  const [closingMenu, setClosingMenu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const trimmed = title.trim()

  useEffect(() => {
    if (!showSprintAddon) return
    if (selectedSprint || sprintCleared) return
    const def = pickDefaultSprint(sprints)
    if (def) setSelectedSprint(def)
  }, [showSprintAddon, sprints, selectedSprint, sprintCleared])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const wasSubmittingRef = useRef(false)
  useEffect(() => {
    if (wasSubmittingRef.current && !submitting) {
      inputRef.current?.focus()
    }
    wasSubmittingRef.current = submitting
  }, [submitting])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (typeMenuOpen || sprintMenuOpen || closingMenu) return
      const container = containerRef.current
      if (container && !container.contains(e.target as Node)) {
        onDone()
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [typeMenuOpen, sprintMenuOpen, closingMenu, onDone, containerRef])

  const dismissGuardsRef = useRef({
    typeMenuOpen,
    sprintMenuOpen,
    closingMenu,
    submitting
  })
  dismissGuardsRef.current = {
    typeMenuOpen,
    sprintMenuOpen,
    closingMenu,
    submitting
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const onFocusOut = (e: FocusEvent) => {
      const guards = dismissGuardsRef.current
      if (
        guards.typeMenuOpen ||
        guards.sprintMenuOpen ||
        guards.closingMenu ||
        guards.submitting
      )
        return
      const next = e.relatedTarget as Node | null
      if (next !== null && container.contains(next)) return
      onDone()
    }
    container.addEventListener("focusout", onFocusOut)
    return () => container.removeEventListener("focusout", onFocusOut)
  }, [onDone, containerRef])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    const submittedTitle = trimmed
    setTitle("")
    inputRef.current?.focus()
    const exit = await create({
      clientId: Effect.runSync(Random.next).toString(36),
      ticket: { title: submittedTitle, type, status },
      viewerId,
      projectPrefix
    })
    if (Exit.isFailure(exit)) {
      setTitle(submittedTitle)
      return
    }
    const attachTo = activeSprintId ?? selectedSprint?.id ?? null
    if (attachTo !== null && variant !== "flat") {
      assignTicketToSprint(registry, sprintReq, exit.value.id, attachTo)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault()
      onDone()
    }
  }

  const TypeIcon = TYPE_META[type].icon

  const sprintAddon = showSprintAddon ? (
    <SprintAssignMenu
      open={sprintMenuOpen}
      onOpenChange={(open) => {
        setSprintMenuOpen(open)
        if (!open) {
          setClosingMenu(true)
          // @effect-diagnostics-next-line globalTimers:off
          setTimeout(() => {
            inputRef.current?.focus()
            setClosingMenu(false)
          }, 0)
        }
      }}
      finalFocus={() => {
        setClosingMenu(false)
        return inputRef.current
      }}
      sprints={sprints}
      selectedId={selectedSprint?.id ?? null}
      onSelect={(s) => {
        setSelectedSprint(s)
        setSprintCleared(false)
      }}
      onClear={() => {
        setSelectedSprint(null)
        setSprintCleared(true)
      }}
      clearLabel={m.tickets_sprint_popover_no_assignment_action()}
      trigger={
        <button
          type="button"
          aria-label={
            selectedSprint
              ? m.tickets_sprint_chip_aria({ name: selectedSprint.name })
              : m.tickets_assign_sprint_chip()
          }
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 transition-expand",
            BADGE_TONES.muted
          )}
        >
          {selectedSprint ? (
            <SprintStateIcon sprint={selectedSprint} size="md" />
          ) : (
            <Plus className="size-4 shrink-0" strokeWidth={1.75} />
          )}
          <CollapsingLabel
            show
            contentKey={selectedSprint?.id ?? "none"}
            gap={6}
          >
            <span className="max-w-[10ch] truncate text-xs">
              {selectedSprint
                ? selectedSprint.name
                : m.tickets_assign_sprint_chip()}
            </span>
          </CollapsingLabel>
        </button>
      }
    />
  ) : null

  return (
    <form onSubmit={onSubmit} className="flex w-full items-center gap-2">
      <DropdownMenu
        open={typeMenuOpen}
        onOpenChange={(open) => {
          setTypeMenuOpen(open)
          if (!open) {
            setClosingMenu(true)
            // @effect-diagnostics-next-line globalTimers:off
            setTimeout(() => {
              inputRef.current?.focus()
              setClosingMenu(false)
            }, 0)
          }
        }}
      >
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={m.tickets_create_type_aria_label({
                type: TYPE_LABELS[type]()
              })}
              className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 transition-expand",
                BADGE_TONES[TYPE_META[type].tone]
              )}
            >
              <TypeIcon className="size-4 shrink-0" strokeWidth={1.75} />
              <CollapsingLabel show contentKey={type} gap={6}>
                <span className="text-xs">{TYPE_LABELS[type]()}</span>
              </CollapsingLabel>
            </button>
          }
        />
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="w-40"
          finalFocus={() => {
            setClosingMenu(false)
            return inputRef.current
          }}
        >
          {(Object.keys(TYPE_META) as TicketType[]).map((t) => {
            const TIcon = TYPE_META[t].icon
            return (
              <DropdownMenuItem
                key={t}
                onClick={() => setType(t)}
                className="cursor-pointer"
              >
                <TIcon className="size-4" strokeWidth={1.75} />
                {TYPE_LABELS[t]()}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {sprintAddon}

      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={m.tickets_section_create_placeholder()}
        aria-label={m.tickets_section_create_placeholder()}
        disabled={submitting}
        maxLength={200}
        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />

      {error && (
        <span className="shrink-0 text-xs text-destructive">{error}</span>
      )}
    </form>
  )
}
