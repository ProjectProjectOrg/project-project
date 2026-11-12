import {
  RegistryContext,
  useAtomRefresh,
  useAtomSet,
  useAtomValue
} from "@effect/atom-react"
import { isEpic, isEpicType } from "@pp/shared"
import type { GroupId, Ticket, TicketId } from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { Check, Plus } from "lucide-react"
import { AnimatePresence } from "motion/react"
import {
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type Ref
} from "react"

import {
  CommandMenu,
  CommandMenuItem,
  CommandMenuList,
  commandMenuItemId,
  useCommandMenu,
  type CommandMenuItemData
} from "@/components/ui/command-menu"
import type { ListboxState } from "@/components/ui/menu-listbox"
import { MenuNote } from "@/components/ui/menu-note"
import { projectGitStates } from "@/features/github/atoms/github"
import { projectRequest } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  assignTicketToSprint,
  bulkAddTicketsToSprint,
  quickCreateInSprint,
  removeTicketFromSprint,
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { TicketStatusIcon } from "@/features/tickets/components/ticket-marks/TicketStatusIcon"
import type { PagedSearchResults } from "@/hooks/usePagedSearch"
import {
  mutationErrorText,
  ticketCreateErrorMessage
} from "@/lib/mutationError"
import { isNearScrollEnd } from "@/lib/scroll"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { CreatorTypeMenu } from "./CreatorMenus"
import { EpicTextPrefix } from "./EpicLabel"
import { EpicTicketPicker, useEpicPicker } from "./EpicTicketPicker"
import { TemplateSlashList, useTemplateSlash } from "./TemplateSlashList"
import { TicketCreatorShell } from "./TicketCreatorShell"
import { useAddableTicketSearch } from "./useAddableTicketSearch"
import { useCreatorFocus } from "./useCreatorFocus"
import { useTemplateChoice, useTicketTypeChoice } from "./useTemplateChoice"

type Item =
  | { kind: "create"; label: string }
  | {
      kind: "existing"
      ticket: Ticket
      added: boolean
      otherSprintName: string | null
    }

const CREATE_VALUE = "__create"

type ListKeys = Readonly<{
  move: (to: 1 | -1, held: boolean) => void
  selectActive: () => boolean
}>

export function SprintTicketCreator({
  groupId,
  excludeIds
}: {
  groupId: GroupId
  excludeIds: ReadonlySet<TicketId>
}) {
  const { orgSlug, slug } = useProjectRoute()
  const registry = useContext(RegistryContext)
  const sprintReq = sprintListRequest(orgSlug, slug)
  const createAtom = quickCreateInSprint({ req: sprintReq, groupId })
  const create = useAtomSet(createAtom, { mode: "promiseExit" })
  const createState = useAtomValue(createAtom)
  const submitting = createState.waiting
  const bulkAdd = useAtomSet(bulkAddTicketsToSprint(sprintReq))
  const bulkAddState = useAtomValue(bulkAddTicketsToSprint(sprintReq))
  const error =
    mutationErrorText(
      createState,
      ticketCreateErrorMessage,
      m.tickets_create_error_fallback
    ) ?? (Result.isFailure(bulkAddState) ? m.sprints_add_epic_failed() : null)
  const projectReq = projectRequest(orgSlug, slug)
  const refreshGitStates = useAtomRefresh(projectGitStates(projectReq))
  const navigate = useNavigate()

  const [title, setTitle] = useState("")
  const { type, setType, applyTemplateDefault } = useTicketTypeChoice()
  const [inputFocused, setInputFocused] = useState(false)
  const [listDismissed, setListDismissed] = useState(false)
  const [added, setAdded] = useState<ReadonlySet<TicketId>>(new Set())
  const [announcement, setAnnouncement] = useState("")
  const picker = useEpicPicker(excludeIds)
  const pendingEpic = picker.epic
  const inputRef = useRef<HTMLInputElement>(null)
  const keysRef = useRef<ListKeys>(null)
  const [menuListbox, setMenuListbox] = useState<ListboxState | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const { active: expanded } = useCreatorFocus(formRef)
  const trimmed = title.trim()
  const templateChoice = useTemplateChoice(orgSlug, slug, type)
  const slash = useTemplateSlash({
    title,
    choice: templateChoice,
    onChoose: (_template, ticketType) => {
      setTitle("")
      if (ticketType !== null && !isEpicType(ticketType)) {
        applyTemplateDefault(ticketType)
      }
    }
  })

  const sprintsResult = useAtomValue(sprintList(sprintReq))
  const { recent, results } = useAddableTicketSearch(
    inputFocused && !slash.open ? trimmed : null
  )

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

  const { items, menuItems } = useMemo(() => {
    const lowered = trimmed.toLowerCase()
    const addable = (ticket: Ticket) =>
      !excludeIds.has(ticket.id) || added.has(ticket.id)
    const shownRecent = recent.filter(addable)
    const recentIds = new Set<string>(shownRecent.map((t) => t.id))
    const found = results.items.filter(
      (t) => addable(t) && !recentIds.has(t.id)
    )
    const existing = (ticket: Ticket): Item => ({
      kind: "existing",
      ticket,
      added: added.has(ticket.id),
      otherSprintName: memberOfOtherSprint.get(ticket.id) ?? null
    })
    const row = (ticket: Ticket, group: string): CommandMenuItemData => ({
      value: ticket.id,
      label: `${ticket.id} ${ticket.title}`,
      group
    })
    const exactTitle = [...shownRecent, ...found].some(
      (t) => t.title.toLowerCase() === lowered
    )
    const create = trimmed.length > 0 && !exactTitle
    return {
      items: new Map<string, Item>([
        ...(create
          ? [[CREATE_VALUE, { kind: "create", label: trimmed }] as const]
          : []),
        ...[...shownRecent, ...found].map((t) => [t.id, existing(t)] as const)
      ]),
      menuItems: [
        ...(create ? [{ value: CREATE_VALUE, label: trimmed }] : []),
        ...shownRecent.map((t) => row(t, m.tickets_mark_group_recent())),
        ...found.map((t) => row(t, m.tickets_mark_group_results()))
      ]
    }
  }, [trimmed, recent, results.items, excludeIds, added, memberOfOtherSprint])

  const note = noteFor(results, menuItems.length > 0)
  const dropdownOpen =
    inputFocused &&
    !slash.open &&
    (pendingEpic !== null ||
      (!listDismissed && (menuItems.length > 0 || note !== null)))

  function reset() {
    picker.close()
    setTitle("")
  }

  function openCreatedTicket(id: TicketId) {
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id },
      search: { focusBody: "1" }
    })
  }

  async function createTicket(title: string) {
    if (submitting) return
    const exit = await create({ title, ...templateChoice.payload })
    templateChoice.recover(exit)
    if (Exit.isSuccess(exit)) {
      refreshGitStates()
      reset()
      openCreatedTicket(exit.value.id)
    }
  }

  function toggleAdded(id: TicketId, wasAdded: boolean) {
    const next = new Set(added)
    if (wasAdded) {
      removeTicketFromSprint(registry, sprintReq, id, groupId)
      next.delete(id)
      setAnnouncement(m.sprints_combobox_removed_announcement({ id }))
    } else {
      assignTicketToSprint(registry, sprintReq, id, groupId)
      next.add(id)
      setAnnouncement(m.sprints_combobox_added_announcement({ id }))
    }
    setAdded(next)
  }

  async function commit(item: Item | undefined) {
    if (!item) return
    if (item.kind === "existing" && isEpic(item.ticket)) {
      picker.open(item.ticket)
      return
    }
    if (item.kind === "existing") {
      toggleAdded(item.ticket.id, item.added)
      return
    }
    await createTicket(item.label)
  }

  function addPendingEpic() {
    if (picker.selection.length === 0) return
    bulkAdd({ groupId, tickets: picker.selection.map((ticket) => ticket.id) })
    reset()
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pendingEpic !== null) {
      addPendingEpic()
      return
    }
    if (dropdownOpen && keysRef.current?.selectActive()) return
    if (trimmed) await createTicket(trimmed)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (slash.onKeyDown(e)) return
    if (pendingEpic !== null) {
      picker.onKeyDown(e)
      return
    }
    if (e.key === "Escape" && dropdownOpen) {
      e.preventDefault()
      setListDismissed(true)
      setAdded(new Set())
      return
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    if (menuItems.length === 0) return
    e.preventDefault()
    if (!dropdownOpen) {
      setListDismissed(false)
      return
    }
    keysRef.current?.move(e.key === "ArrowDown" ? 1 : -1, e.repeat)
  }

  const typeAddon = (
    <CreatorTypeMenu
      type={type}
      epics={false}
      onTypeChange={setType}
      expanded={expanded}
      inputRef={inputRef}
    />
  )

  const dropdown = slash.open ? (
    <TemplateSlashList slash={slash} choice={templateChoice} />
  ) : dropdownOpen ? (
    <div className="absolute inset-x-0 top-full z-30 mt-1 flex max-h-80 flex-col overflow-hidden rounded-xl border border-border/60 bg-card text-foreground shadow-[0_4px_12px_rgba(0,0,0,0.02)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
      <CommandMenu
        items={menuItems}
        onSelect={(item) => {
          const picked = items.get(item.value)
          if (
            picked?.kind === "existing" &&
            pendingEpic?.id === picked.ticket.id
          ) {
            picker.close()
          } else void commit(picked)
        }}
      >
        <CommandMenuKeys
          ref={keysRef}
          hasMore={results.hasMore}
          loadMore={results.loadMore}
          onListboxChange={setMenuListbox}
        />
        <div
          className="flex min-h-0 flex-1 flex-col"
          onScrollCapture={(event) => {
            const viewport = event.target
            if (
              viewport instanceof HTMLElement &&
              viewport.dataset.slot === "scroll-area-viewport" &&
              results.hasMore &&
              isNearScrollEnd(viewport)
            ) {
              results.loadMore()
            }
          }}
        >
          <CommandMenuList
            aria-label={m.sprints_combobox_placeholder()}
            className="p-1.5"
            renderItem={(row) => {
              const item = items.get(row.value)
              if (item === undefined) return null
              const opened =
                item.kind === "existing" && pendingEpic?.id === item.ticket.id
              return (
                <>
                  <CommandMenuItem
                    value={row.value}
                    className={cn(
                      "transition-opacity duration-200",
                      pendingEpic !== null &&
                        !opened &&
                        "pointer-events-none opacity-35"
                    )}
                  >
                    {item.kind === "create" ? (
                      <CreateOption label={item.label} />
                    ) : (
                      <ExistingOption
                        ticket={item.ticket}
                        added={item.added}
                        otherSprintName={item.otherSprintName}
                      />
                    )}
                  </CommandMenuItem>
                  <AnimatePresence initial={false}>
                    {opened && (
                      <EpicTicketPicker
                        key="picker"
                        {...picker.pickerProps}
                        onAdd={addPendingEpic}
                      />
                    )}
                  </AnimatePresence>
                </>
              )
            }}
          />
        </div>
        {note !== null && <MenuNote tone={note.tone}>{note.text}</MenuNote>}
        {results.loadingMore && (
          <MenuNote>{m.tickets_mention_loading_more()}</MenuNote>
        )}
        {results.loadMoreFailed && (
          <MenuNote tone="error">
            {m.tickets_mention_load_more_failed()}
          </MenuNote>
        )}
      </CommandMenu>
    </div>
  ) : null

  return (
    <TicketCreatorShell
      inputRef={inputRef}
      formRef={formRef}
      shortcut="c"
      value={title}
      onValueChange={(v) => {
        picker.close()
        slash.onTitleChange(title, v)
        setTitle(v)
        setListDismissed(false)
      }}
      onFocus={() => {
        setInputFocused(true)
        setListDismissed(false)
      }}
      onBlur={() => {
        setInputFocused(false)
        setAdded(new Set())
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
      listbox={slash.open ? slash.listbox : menuListbox}
      leadingAddons={[typeAddon]}
      belowInput={
        <>
          {dropdown}
          <span role="status" className="sr-only">
            {announcement}
          </span>
        </>
      }
    />
  )
}

function CommandMenuKeys({
  ref,
  hasMore,
  loadMore,
  onListboxChange
}: Readonly<{
  ref: Ref<ListKeys>
  hasMore: boolean
  loadMore: () => void
  onListboxChange: (listbox: ListboxState | null) => void
}>) {
  const { move, rows, highlight, select, listId } = useCommandMenu()
  const index = useSyncExternalStore(
    highlight.subscribe,
    highlight.get,
    () => null
  )
  useEffect(() => {
    onListboxChange({
      id: listId,
      open: true,
      activeId: index === null ? null : commandMenuItemId(listId, index)
    })
  }, [listId, index, onListboxChange])
  useEffect(() => () => onListboxChange(null), [onListboxChange])
  useImperativeHandle(
    ref,
    () => ({
      move: (to, held) => {
        if (to === 1 && hasMore && highlight.get() === rows.length - 1) {
          loadMore()
          return
        }
        move(to, held)
      },
      selectActive: () => {
        const index = highlight.get()
        const row = index === null ? undefined : rows[index]
        if (row === undefined) return false
        select(row)
        return true
      }
    }),
    [move, rows, highlight, select, hasMore, loadMore]
  )
  return null
}

const noteFor = (
  results: PagedSearchResults<Ticket>,
  hasRows: boolean
): Readonly<{ text: string; tone: "muted" | "error" }> | null => {
  if (results.status === "failed") {
    return { text: m.tickets_mention_tickets_failed(), tone: "error" }
  }
  if (hasRows) return null
  if (results.status === "loading" || results.status === "searching") {
    return { text: m.tickets_mention_tickets_loading(), tone: "muted" }
  }
  if (results.status === "ready") {
    return { text: m.tickets_mention_tickets_empty(), tone: "muted" }
  }
  return null
}

function CreateOption({ label }: Readonly<{ label: string }>) {
  return (
    <>
      <Plus strokeWidth={1.75} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        {m.sprints_combobox_create_prefix()}
        <span className="text-foreground">{label}</span>
      </span>
    </>
  )
}

function ExistingOption({
  ticket,
  added,
  otherSprintName
}: Readonly<{
  ticket: Ticket
  added: boolean
  otherSprintName: string | null
}>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <>
      <TicketStatusIcon
        status={ticket.status}
        orgSlug={orgSlug}
        slug={slug}
        className="size-4"
      />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
          {ticket.id}
        </span>
        <span className="min-w-0 truncate">
          <EpicTextPrefix parent={ticket.parent} />
          {ticket.title}
        </span>
      </span>
      {added ? (
        <span className="flex shrink-0 items-center gap-1 text-caption text-muted-foreground">
          <Check strokeWidth={1.75} className="size-3" />
          {m.sprints_combobox_added()}
        </span>
      ) : (
        otherSprintName && (
          <span className="shrink-0 text-caption text-muted-foreground">
            {m.sprints_add_tickets_in_other_sprint({ name: otherSprintName })}
          </span>
        )
      )}
    </>
  )
}
