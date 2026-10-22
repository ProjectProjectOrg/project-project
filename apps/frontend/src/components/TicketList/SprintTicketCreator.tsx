import {
  RegistryContext,
  useAtomRefresh,
  useAtomSet,
  useAtomValue
} from "@effect/atom-react"
import type { GroupId, Ticket, TicketId } from "@pp/shared"
import { useDebouncer } from "@tanstack/react-pacer"
import { useNavigate } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Random from "effect/Random"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { Plus } from "lucide-react"
import {
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent
} from "react"

import {
  MenuListbox,
  MenuOption,
  optionId,
  type ListboxState
} from "@/components/ui/menu-listbox"
import { menuItemMetaClass } from "@/components/ui/menu-styles"
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
import {
  searchRequest,
  ticketSearch
} from "@/features/tickets/atoms/ticketSearch"
import { TYPE_META } from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"

import { creatorErrorText } from "./creatorError"
import { CreatorTypeMenu } from "./CreatorMenus"
import { TemplateSlashList, useTemplateSlash } from "./TemplateSlashList"
import { TicketCreatorShell } from "./TicketCreatorShell"
import { useCreatorFocus } from "./useCreatorFocus"
import { useTemplateChoice, useTicketTypeChoice } from "./useTemplateChoice"

const idleSearchAtom = Atom.make(Result.initial<ReadonlyArray<Ticket>>())

type Item =
  | { kind: "create"; label: string }
  | { kind: "existing"; ticket: Ticket; otherSprintName: string | null }

export function SprintTicketCreator({
  orgSlug,
  slug,
  groupId,
  excludeIds
}: {
  orgSlug: string
  slug: string
  groupId: GroupId
  excludeIds: ReadonlySet<TicketId>
}) {
  const registry = useContext(RegistryContext)
  const sprintReq = useMemo(
    () => sprintListRequest(orgSlug, slug),
    [orgSlug, slug]
  )
  const req = useMemo(
    () =>
      backlogRequest(orgSlug, slug, {
        sort: { key: "updated", dir: "desc" },
        groupId: [groupId]
      }),
    [orgSlug, slug, groupId]
  )

  const create = useAtomSet(quickCreateBacklogTicket(req), {
    mode: "promiseExit"
  })
  const createState = useAtomValue(quickCreateBacklogTicket(req))
  const submitting = createState.waiting
  const viewer = useAtomValue(me())
  const viewerId = Result.isSuccess(viewer) ? viewer.value.id : ""
  const project = useAtomValue(projectView(projectRequest(orgSlug, slug)))
  const projectPrefix = Result.isSuccess(project) ? project.value.key : "T"
  const estimation = Result.isSuccess(project)
    ? project.value.estimation
    : "off"
  const error = creatorErrorText(createState)
  const projectReq = useMemo(
    () => projectRequest(orgSlug, slug),
    [orgSlug, slug]
  )
  const refreshGitStates = useAtomRefresh(projectGitStates(projectReq))
  const navigate = useNavigate()

  const [title, setTitle] = useState("")
  const { type, setType, applyTemplateDefault } = useTicketTypeChoice()
  const [inputFocused, setInputFocused] = useState(false)
  const [listDismissed, setListDismissed] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const listboxId = useId()
  const { active: expanded } = useCreatorFocus(formRef)
  const trimmed = title.trim()
  const templateChoice = useTemplateChoice(orgSlug, slug, type)
  const slash = useTemplateSlash({
    title,
    choice: templateChoice,
    onChoose: (_template, ticketType) => {
      searchDebouncer.cancel()
      setSearchQuery("")
      setTitle("")
      setHighlight(0)
      if (ticketType !== null) applyTemplateDefault(ticketType)
    }
  })

  const [searchQuery, setSearchQuery] = useState("")
  const searchDebouncer = useDebouncer(setSearchQuery, { wait: 200 })
  const searchAtom = ticketSearch(
    searchRequest(orgSlug, slug, {
      q: searchQuery || undefined,
      excludeGroupId: groupId,
      limit: 24
    })
  )
  const ticketsResult = useAtomValue(
    inputFocused && !slash.open && trimmed === searchQuery
      ? searchAtom
      : idleSearchAtom
  )
  const sprintsResult = useAtomValue(sprintList(sprintReq))

  const memberOfOtherSprint = useMemo(() => {
    const map = new Map<string, string>()
    if (!Result.isSuccess(sprintsResult)) return map
    for (const s of sprintsResult.value) {
      if (s.id === groupId || s.completedAt !== null) continue
      for (const tid of s.tickets) {
        if (!map.has(tid)) map.set(tid, s.name)
      }
    }
    return map
  }, [sprintsResult, groupId])

  const items: ReadonlyArray<Item> = useMemo(() => {
    const lowered = trimmed.toLowerCase()
    const all = Result.isSuccess(ticketsResult) ? ticketsResult.value : []
    const eligible = all.filter(
      (t) => t.status !== "done" && !excludeIds.has(t.id)
    )
    const exactTitle = all.some((t) => t.title.toLowerCase() === lowered)
    const existing: Array<Item> = eligible.slice(0, 8).map((t) => ({
      kind: "existing" as const,
      ticket: t,
      otherSprintName: memberOfOtherSprint.get(t.id) ?? null
    }))
    if (trimmed.length === 0 || exactTitle) return existing
    return [{ kind: "create" as const, label: trimmed }, ...existing]
  }, [trimmed, ticketsResult, excludeIds, memberOfOtherSprint])

  const dropdownOpen =
    inputFocused && !listDismissed && !slash.open && items.length > 0
  const safeHighlight = items.length === 0 ? 0 : highlight % items.length
  const listbox: ListboxState = slash.open
    ? slash.listbox
    : {
        id: listboxId,
        open: dropdownOpen,
        activeIndex: dropdownOpen ? safeHighlight : null
      }

  function reset() {
    searchDebouncer.cancel()
    setSearchQuery("")
    setTitle("")
    setHighlight(0)
  }

  function openCreatedTicket(id: TicketId) {
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id },
      search: { focusBody: 1 }
    })
  }

  async function commit(item: Item | undefined) {
    if (!item) return
    if (item.kind === "existing") {
      assignTicketToSprint(registry, sprintReq, item.ticket.id, groupId)
      reset()
      return
    }
    if (submitting) return
    const exit = await create({
      clientId: Effect.runSync(Random.next).toString(36),
      ticket: { title: item.label, type, ...templateChoice.payload },
      viewerId,
      projectPrefix,
      estimation,
      prediction: templateChoice.prediction
    })
    templateChoice.recover(exit)
    if (Exit.isSuccess(exit)) {
      assignTicketToSprint(registry, sprintReq, exit.value.id, groupId)
      refreshGitStates()
      reset()
      openCreatedTicket(exit.value.id)
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (dropdownOpen) {
      await commit(items[safeHighlight])
      return
    }
    if (!trimmed || submitting) return
    const exit = await create({
      clientId: Effect.runSync(Random.next).toString(36),
      ticket: { title: trimmed, type, ...templateChoice.payload },
      viewerId,
      projectPrefix,
      estimation,
      prediction: templateChoice.prediction
    })
    templateChoice.recover(exit)
    if (Exit.isSuccess(exit)) {
      assignTicketToSprint(registry, sprintReq, exit.value.id, groupId)
      refreshGitStates()
      reset()
      openCreatedTicket(exit.value.id)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (slash.onKeyDown(e)) return
    if (e.key === "Escape" && dropdownOpen) {
      e.preventDefault()
      setListDismissed(true)
      return
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    if (items.length === 0) return
    e.preventDefault()
    if (!dropdownOpen) {
      setListDismissed(false)
      return
    }
    const step = e.key === "ArrowDown" ? 1 : -1
    setHighlight((safeHighlight + step + items.length) % items.length)
  }

  const typeAddon = (
    <CreatorTypeMenu
      type={type}
      onTypeChange={setType}
      expanded={expanded}
      inputRef={inputRef}
    />
  )

  const dropdown = slash.open ? (
    <TemplateSlashList slash={slash} choice={templateChoice} />
  ) : dropdownOpen ? (
    <MenuListbox id={listboxId} aria-label={m.sprints_combobox_placeholder()}>
      {items.map((item, idx) => (
        <MenuOption
          key={item.kind === "create" ? "__create" : item.ticket.id}
          id={optionId(listboxId, idx)}
          highlighted={idx === safeHighlight}
          onHighlight={() => setHighlight(idx)}
          onSelect={() => void commit(item)}
        >
          {item.kind === "create" ? (
            <CreateOption label={item.label} />
          ) : (
            <ExistingOption
              ticket={item.ticket}
              otherSprintName={item.otherSprintName}
            />
          )}
        </MenuOption>
      ))}
    </MenuListbox>
  ) : null

  return (
    <TicketCreatorShell
      inputRef={inputRef}
      formRef={formRef}
      shortcut="c"
      value={title}
      onValueChange={(v) => {
        slash.onTitleChange(title, v)
        setTitle(v)
        setHighlight(0)
        setListDismissed(false)
        searchDebouncer.cancel()
        searchDebouncer.maybeExecute(v.trim())
      }}
      onPointerEnter={() => registry.mount(searchAtom)()}
      onFocus={() => {
        searchDebouncer.cancel()
        setSearchQuery(trimmed)
        setInputFocused(true)
        setListDismissed(false)
      }}
      onBlur={() => {
        searchDebouncer.cancel()
        setInputFocused(false)
        slash.close()
      }}
      onKeyDown={onKeyDown}
      onSubmit={onSubmit}
      expanded={expanded}
      placeholder={m.sprints_combobox_placeholder()}
      ariaLabel={m.sprints_combobox_placeholder()}
      busy={submitting}
      maxLength={200}
      error={error}
      listbox={listbox}
      leadingAddons={[typeAddon]}
      belowInput={dropdown}
    />
  )
}

function CreateOption({ label }: Readonly<{ label: string }>) {
  return (
    <>
      <Plus strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">
        {m.sprints_combobox_create_prefix()}
        <span className="text-foreground">{label}</span>
      </span>
    </>
  )
}

function ExistingOption({
  ticket,
  otherSprintName
}: Readonly<{ ticket: Ticket; otherSprintName: string | null }>) {
  const Icon = TYPE_META[ticket.type].icon
  return (
    <>
      <Icon strokeWidth={1.75} />
      <span className="font-mono text-[11px] tabular-nums">{ticket.id}</span>
      <span className="min-w-0 flex-1 truncate">{ticket.title}</span>
      {otherSprintName && (
        <span data-menu-meta className={menuItemMetaClass}>
          {m.sprints_add_tickets_in_other_sprint({ name: otherSprintName })}
        </span>
      )}
    </>
  )
}
