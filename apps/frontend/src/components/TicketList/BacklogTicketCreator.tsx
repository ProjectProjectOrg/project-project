import {
  RegistryContext,
  useAtomRefresh,
  useAtomSet,
  useAtomValue
} from "@effect/atom-react"
import type { Group, TicketListQuery, TicketType } from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Random from "effect/Random"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { Plus } from "lucide-react"
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react"

import { CollapsingLabel } from "@/components/SegmentedTabs"
import {
  pickDefaultSprint,
  SprintAssignMenu
} from "@/components/sprints/SprintAssignMenu"
import { SprintStateIcon } from "@/components/sprints/SprintChip"
import { BADGE_TONES } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { me } from "@/features/auth/atoms/auth"
import { projectGitStates } from "@/features/github/atoms/github"
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
  quickCreateBacklogTicket
} from "@/features/tickets/atoms/backlog"
import { TYPE_LABELS, TYPE_META } from "@/lib/ticket-meta"
import { useGlobalShortcut } from "@/lib/use-global-shortcut"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { CreatorChip } from "./CreatorChip"
import { creatorErrorText } from "./creatorError"
import { TemplateSlashList, useTemplateSlash } from "./TemplateSlashList"
import { TicketCreatorShell } from "./TicketCreatorShell"
import { useTemplateChoice, useTicketTypeChoice } from "./useTemplateChoice"

export function BacklogTicketCreator({
  orgSlug,
  slug,
  query
}: {
  orgSlug: string
  slug: string
  query: TicketListQuery
}) {
  const registry = useContext(RegistryContext)
  const req = useMemo(
    () => backlogRequest(orgSlug, slug, query),
    [orgSlug, slug, query]
  )
  const create = useAtomSet(quickCreateBacklogTicket(req), {
    mode: "promiseExit"
  })
  const createState = useAtomValue(quickCreateBacklogTicket(req))
  const submitting = createState.waiting
  const error = creatorErrorText(createState)
  const projectReq = useMemo(
    () => projectRequest(orgSlug, slug),
    [orgSlug, slug]
  )
  const refreshGitStates = useAtomRefresh(projectGitStates(projectReq))
  const navigate = useNavigate()

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
  const hasSprints = sprints.some((s) => s.completedAt === null)

  const [title, setTitle] = useState("")
  const { type, setType, applyTemplateDefault } = useTicketTypeChoice()
  const [selectedSprint, setSelectedSprint] = useState<Group | null>(null)
  const [sprintCleared, setSprintCleared] = useState(false)
  const [focused, setFocused] = useState(false)
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
  const [sprintMenuOpen, setSprintMenuOpen] = useState(false)
  const [closingMenu, setClosingMenu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useGlobalShortcut("c", inputRef)
  const trimmed = title.trim()
  const expanded = focused || typeMenuOpen || sprintMenuOpen || closingMenu
  const templateChoice = useTemplateChoice(orgSlug, slug, type)
  const slash = useTemplateSlash({
    title,
    choice: templateChoice,
    onChoose: (_template, ticketType) => {
      setTitle("")
      if (ticketType !== null) applyTemplateDefault(ticketType)
    }
  })

  const refocusAfterMenu = (open: boolean) => {
    if (open) return
    setClosingMenu(true)
    // @effect-diagnostics-next-line globalTimers:off
    setTimeout(() => {
      inputRef.current?.focus()
      setClosingMenu(false)
    }, 0)
  }

  useEffect(() => {
    if (selectedSprint || sprintCleared) return
    const def = pickDefaultSprint(sprints)
    if (def) setSelectedSprint(def)
  }, [sprints, selectedSprint, sprintCleared])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    inputRef.current?.blur()
    setFocused(false)
    const exit = await create({
      clientId: Effect.runSync(Random.next).toString(36),
      ticket: { title: trimmed, type, ...templateChoice.payload },
      viewerId,
      projectPrefix,
      prediction: templateChoice.prediction
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

  const TypeIcon = TYPE_META[type].icon
  const typeAddon = (
    <DropdownMenu
      open={typeMenuOpen}
      onOpenChange={(open) => {
        setTypeMenuOpen(open)
        refocusAfterMenu(open)
      }}
    >
      <DropdownMenuTrigger
        render={
          <CreatorChip
            expanded={expanded}
            tone={TYPE_META[type].tone}
            icon={<TypeIcon className="size-4 shrink-0" strokeWidth={1.75} />}
            label={TYPE_LABELS[type]()}
            contentKey={type}
            aria-label={m.tickets_create_type_aria_label({
              type: TYPE_LABELS[type]()
            })}
          />
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
  )

  const sprintAddon = hasSprints ? (
    <SprintAssignMenu
      open={sprintMenuOpen}
      onOpenChange={(open) => {
        setSprintMenuOpen(open)
        if (!open) setClosingMenu(true)
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
            "transition-expand inline-flex h-6 items-center gap-1.5 rounded-md",
            expanded
              ? cn("px-2", BADGE_TONES.muted)
              : "px-1 hover:bg-accent hover:text-foreground"
          )}
        >
          {selectedSprint ? (
            <SprintStateIcon sprint={selectedSprint} size="md" />
          ) : (
            <Plus className="size-4 shrink-0" strokeWidth={1.75} />
          )}
          <CollapsingLabel
            show={expanded}
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

  const trailing = (
    <>
      {error && (
        <span className="shrink-0 text-xs text-destructive">{error}</span>
      )}
      {!expanded && !error && <Kbd>c</Kbd>}
    </>
  )

  return (
    <TicketCreatorShell
      formProps={{ "data-active": expanded || undefined }}
      inputRef={inputRef}
      value={title}
      onValueChange={(next) => {
        slash.onTitleChange(title, next)
        setTitle(next)
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        slash.close()
      }}
      onKeyDown={(e) => {
        slash.onKeyDown(e)
      }}
      onSubmit={onSubmit}
      expanded={expanded}
      placeholder={m.tickets_create_title_placeholder()}
      ariaLabel={m.tickets_create_title_aria_label()}
      disabled={submitting}
      maxLength={200}
      leadingAddons={[typeAddon, sprintAddon].filter((addon) => addon !== null)}
      trailing={trailing}
      belowInput={<TemplateSlashList slash={slash} choice={templateChoice} />}
    />
  )
}
