import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  EPIC_TYPE,
  isEpic,
  ESTIMATE_SIZES,
  TagName,
  type Estimate
} from "@pp/shared"
import {
  CommandMenuCheck,
  CommandMenuItem,
  CommandMenuShortcut
} from "@pp/ui/command-menu"
import { blockIconComponent } from "@pp/ui/editor/blocks/block-icons"
import { Archive, CircleSlash, Flag, Layers, Plus, Trash2 } from "@pp/ui/icons"
import * as Cause from "effect/Cause"
import * as DateTime from "effect/DateTime"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { useState } from "react"

import {
  commandScopes,
  commandMenuState
} from "@/features/command-menu/atoms/commandMenu"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import {
  commandMenuRow,
  pointedAt
} from "@/features/command-menu/lib/commandMenu"
import type { TicketContext } from "@/features/command-menu/lib/commandMenu"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import {
  scopeSelectionClear,
  scopeSelectionUpdate
} from "@/features/command-menu/lib/commandScopes"
import {
  projectActor,
  projectRequest
} from "@/features/projects/atoms/projects"
import { createTag, tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { bulkUpdateTickets } from "@/features/tickets/atoms/bulkTickets"
import { newTicketRequest } from "@/features/tickets/atoms/createTicket"
import { epicsRequest, projectEpics } from "@/features/tickets/atoms/epics"
import { runTicketRemoval } from "@/features/tickets/atoms/runTicketRemoval"
import {
  archiveTicket,
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { TicketIdText } from "@/features/tickets/components/TicketIdText"
import { NoTypeIcon } from "@/features/tickets/components/TypeGlyph"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import {
  formatEstimate,
  parseEstimateMinutes,
  parseEstimatePoints
} from "@/features/tickets/lib/estimateMeta"
import { flagFor } from "@/features/tickets/lib/ticketFlag"
import { parentRef } from "@/features/tickets/lib/ticketPatch"
import {
  typeKeyOfOption,
  typeName,
  typeOptions,
  typeOptionValue
} from "@/features/tickets/lib/ticketTypes"
import { errorMessage } from "@/lib/errorMessage"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

import {
  StagedChanges,
  StagedRowCount,
  StagedToggle,
  StagedValue,
  useStagedToggles
} from "./StagedChanges"
import { useCommandAction } from "./useCommandAction"
import { useTicketMutation } from "./useTicketMutation"

export type TicketPageProps = CommandPageProps &
  Readonly<{ ticket: TicketContext }>

const CLEAR = "clear"
const NEW_EPIC = "new-epic"
const CREATE_TAG = "create-tag"
const ARCHIVE = "archive"
const FLAG = "flag"
const DELETE = "delete"
const DELETE_CASCADE = "delete-cascade"
const POINT_PRESETS = [1, 2, 3, 5, 8, 13] as const
const MINUTE_PRESETS = [30, 60, 120, 240, 480] as const

const decodeTagName = Schema.decodeUnknownOption(TagName)

const sameEstimate = (a: Estimate | null, b: Estimate) =>
  a !== null && formatEstimate(a) === formatEstimate(b) && a.unit === b.unit

const estimateOptions = (mode: "points" | "tshirt" | "time", query: string) => {
  if (mode === "tshirt") {
    return ESTIMATE_SIZES.map(
      (value) => ({ unit: "tshirt", value }) satisfies Estimate
    )
  }
  if (mode === "points") {
    const typed = parseEstimatePoints(query)
    const presets = POINT_PRESETS.map(
      (value) => ({ unit: "points", value }) satisfies Estimate
    )
    return typed === null || POINT_PRESETS.some((value) => value === typed)
      ? presets
      : [{ unit: "points", value: typed } satisfies Estimate, ...presets]
  }
  const typed = parseEstimateMinutes(query)
  const presets = MINUTE_PRESETS.map(
    (minutes) => ({ unit: "time", minutes }) satisfies Estimate
  )
  return typed === null || MINUTE_PRESETS.some((value) => value === typed)
    ? presets
    : [{ unit: "time", minutes: typed } satisfies Estimate, ...presets]
}

export function TicketEstimatePage({
  ticket,
  context,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const { current, update } = useTicketMutation(ticket, context.selection)
  const [query, setQuery] = useState("")
  const mode = context.project?.estimation ?? "off"
  if (mode === "off") return null
  const options = estimateOptions(mode, query)
  const byValue = new Map(
    options.map((estimate) => [formatEstimate(estimate), estimate])
  )
  const estimate = current?.estimate ?? null
  const clearable =
    context.selection.length > 1
      ? context.selection.some((each) => each.estimate !== null)
      : estimate !== null
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_estimate_placeholder()}
      onBack={onBack}
      onSearchChange={setQuery}
      items={[
        ...options.map((option) => ({
          value: formatEstimate(option),
          label: formatEstimate(option),
          prefiltered: mode !== "tshirt"
        })),
        ...(!clearable
          ? []
          : [
              {
                value: CLEAR,
                label: m.tickets_command_clear_estimate(),
                icon: CircleSlash
              }
            ])
      ]}
      onSelect={(item) => {
        if (item.value === CLEAR) update({ estimate: null })
        else {
          const picked = byValue.get(item.value)
          if (picked !== undefined) update({ estimate: picked })
        }
        env.close()
      }}
      renderItem={(item) => {
        const option = byValue.get(item.value)
        return (
          <CommandMenuItem value={item.value}>
            <span className="min-w-0 flex-1 truncate tabular-nums">
              {item.label}
            </span>
            <CommandMenuCheck
              checked={option !== undefined && sameEstimate(estimate, option)}
              label={m.chrome_command_menu_selected()}
            />
          </CommandMenuItem>
        )
      }}
    />
  )
}

export function TicketTypePage({
  ticket,
  context,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const { current, update } = useTicketMutation(ticket, context.selection)
  const options = typeOptions(useTicketTypes(ticket.orgSlug, ticket.slug))
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_type_placeholder()}
      onBack={onBack}
      items={options.map((option) => ({
        value: option.value,
        label: typeName(option.type),
        icon:
          option.type === null
            ? NoTypeIcon
            : blockIconComponent(option.type.icon)
      }))}
      onSelect={(item) => {
        const option = options.find(
          (candidate) => candidate.value === item.value
        )
        if (option !== undefined) {
          update({ type: typeKeyOfOption(option.value) })
        }
        env.close()
      }}
      numbered
      renderItem={(item, number) => (
        <CommandMenuItem value={item.value}>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {number !== undefined && (
            <CommandMenuShortcut
              keys={number}
              keyLabels={keyLabels()}
              aria-hidden
            />
          )}
          <CommandMenuCheck
            checked={
              current !== null &&
              current.type !== undefined &&
              typeOptionValue(current.type) === item.value
            }
            label={m.chrome_command_menu_selected()}
          />
        </CommandMenuItem>
      )}
    />
  )
}

export function TicketTagsPage({
  ticket,
  context,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const { current, update } = useTicketMutation(ticket, context.selection)
  // Several tickets: toggles are staged, and Apply sends them all at once.
  const many = context.selection.length > 1
  const staged = useStagedToggles(context.selection.map((each) => each.tags))
  const apply = () => {
    if (staged.changes.length === 0) return
    update({ tags: { add: staged.add, remove: staged.remove } })
    env.close()
  }
  const req = tagsRequest(ticket.orgSlug, ticket.slug)
  const result = useAtomValue(tagsFor(req))
  const create = useAtomSet(createTag(req), { mode: "promiseExit" })
  const canCreate = useAtomValue(
    projectActor(projectRequest(ticket.orgSlug, ticket.slug))
  ).call("tags", "create")
  const [query, setQuery] = useState("")
  const [failure, setFailure] = useState<string | null>(null)
  const run = useCommandAction()
  const tags = Result.isSuccess(result) ? result.value : []
  const applied = current?.tags ?? []
  const newName = Option.filter(
    decodeTagName(query.trim().toLowerCase()),
    (name) => canCreate && !tags.some((tag) => tag.name === name)
  )
  return (
    <CommandFrame
      chip={chip}
      placeholder={
        canCreate
          ? m.tags_search_or_create_placeholder()
          : m.tickets_command_tags_placeholder()
      }
      onBack={onBack}
      onSearchChange={setQuery}
      notice={failure}
      onSubmit={many ? apply : undefined}
      footer={
        many ? (
          <StagedChanges
            hint={m.tickets_selection_toggle()}
            applyLabel={m.tickets_selection_apply({ count: staged.affected })}
            onApply={apply}
            lines={staged.changes.map(({ value, on, count }) => ({
              key: value,
              count,
              change: (
                <StagedToggle on={on}>
                  <StagedValue
                    label={value}
                    icon={
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: tags.find(
                            (tag) => tag.name === value
                          )?.color
                        }}
                      />
                    }
                  />
                </StagedToggle>
              )
            }))}
          />
        ) : undefined
      }
      items={[
        ...tags.map((tag) => ({ value: tag.name, label: tag.name })),
        ...(Option.isSome(newName)
          ? [
              {
                value: CREATE_TAG,
                label: m.tags_create_button({ name: newName.value }),
                icon: Plus,
                prefiltered: true
              }
            ]
          : [])
      ]}
      onSelect={async (item) => {
        if (item.value === CREATE_TAG) {
          if (Option.isNone(newName)) return
          await run(async () => {
            setFailure(null)
            const exit = await create({ name: newName.value })
            if (Exit.isFailure(exit))
              setFailure(errorMessage(Cause.squash(exit.cause)))
            else if (many) staged.toggle(newName.value)
            else update({ tags: { add: [newName.value] } })
          })
          return
        }
        const tag = tags.find((candidate) => candidate.name === item.value)
        if (tag === undefined) return
        if (many) {
          staged.toggle(tag.name)
          return
        }
        update({
          tags: applied.includes(tag.name)
            ? { remove: [tag.name] }
            : { add: [tag.name] }
        })
      }}
      renderItem={(item) => {
        const tag = tags.find((candidate) => candidate.name === item.value)
        return (
          <CommandMenuItem value={item.value}>
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: tag?.color }}
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {many && tag !== undefined && (
              <StagedRowCount count={staged.held(tag.name)} />
            )}
            <CommandMenuCheck
              checked={
                tag !== undefined &&
                (many ? staged.checked(tag.name) : applied.includes(tag.name))
              }
              label={m.chrome_command_menu_selected()}
            />
          </CommandMenuItem>
        )
      }}
    />
  )
}

export function TicketParentPage({
  ticket,
  context,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const { current, update } = useTicketMutation(ticket)
  const result = useAtomValue(
    projectEpics(epicsRequest(ticket.orgSlug, ticket.slug))
  )
  const epics = (Result.isSuccess(result) ? result.value : []).filter(
    (epic) => epic.id !== ticket.ticketId
  )
  const parent = current?.parent?.id ?? null
  return (
    <CommandFrame
      fixedHeight
      chip={chip}
      placeholder={m.tickets_command_parent_placeholder()}
      onBack={onBack}
      items={[
        ...epics.map((epic) => ({
          value: epic.id,
          label: `${epic.id} ${epic.title}`,
          prefix: epic.id,
          icon: Layers
        })),
        ...(context.tickets.create
          ? [
              {
                value: NEW_EPIC,
                label: m.tickets_command_new_epic(),
                icon: Plus
              }
            ]
          : []),
        ...(parent === null
          ? []
          : [
              {
                value: CLEAR,
                label: m.tickets_command_remove_parent(),
                icon: CircleSlash
              }
            ])
      ]}
      onSelect={(item) => {
        if (item.value === NEW_EPIC) {
          env.registry.set(newTicketRequest, {
            orgSlug: ticket.orgSlug,
            projectSlug: ticket.slug,
            type: EPIC_TYPE,
            related: { kind: "epicOf", ticketId: ticket.ticketId }
          })
          env.open("createTicket")
          return
        }
        if (item.value === CLEAR) update({ parent: null })
        else {
          const epic = epics.find((candidate) => candidate.id === item.value)
          if (epic !== undefined) update({ parent: parentRef(epic) })
        }
        env.close()
      }}
      renderItem={(item) => {
        const epic = epics.find((candidate) => candidate.id === item.value)
        return (
          <CommandMenuItem value={item.value}>
            {epic === undefined ? (
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            ) : (
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="min-w-(--row-key-width) shrink-0 text-caption text-muted-foreground tabular-nums">
                  {epic.id}
                </span>
                <span className="min-w-0 truncate">{epic.title}</span>
              </span>
            )}
            <CommandMenuCheck
              checked={epic !== undefined && epic.id === parent}
              label={m.chrome_command_menu_selected()}
            />
          </CommandMenuItem>
        )
      }}
    />
  )
}

const failureOf = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) ? errorMessage(Cause.squash(exit.cause)) : null

export function TicketArchivePage({
  ticket,
  context,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const archive = useAtomSet(
    archiveTicket(ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)),
    { mode: "promiseExit" }
  )
  const scopes = useAtomValue(commandScopes)
  const row = pointedAt(commandMenuRow(useAtomValue(commandMenuState)), ticket)
  const clearSelection = scopeSelectionClear(scopes)
  const many = context.selection.length > 1
  const [reason, setReason] = useState("")
  const [failure, setFailure] = useState<string | null>(null)
  const run = useCommandAction()
  const trimmed = reason.trim()
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_archive_reason_placeholder()}
      onBack={onBack}
      filter={false}
      onSearchChange={setReason}
      notice={failure}
      items={[
        {
          value: ARCHIVE,
          label: many
            ? m.tickets_row_archive_many_menu_item({
                count: context.selection.length
              })
            : trimmed === ""
              ? m.tickets_command_archive_action({ id: ticket.ticketId })
              : m.tickets_command_archive_with_reason({ id: ticket.ticketId }),
          icon: Archive
        }
      ]}
      renderItem={(item) => (
        <CommandMenuItem value={item.value}>
          <span className="min-w-0 flex-1 truncate">
            {many ? (
              item.label
            ) : (
              <TicketIdText id={ticket.ticketId}>{item.label}</TicketIdText>
            )}
          </span>
        </CommandMenuItem>
      )}
      onSelect={async () => {
        await run(async () => {
          setFailure(null)
          const reasonInput = trimmed === "" ? {} : { reason: trimmed }
          const selectionView = scopes.findLast(
            (scope) => scope.selection?.() != null
          )?.removalView
          if (many || row?.remove) {
            const tickets = many
              ? context.selection.map((each) => each.id)
              : [ticket.ticketId]
            void runTicketRemoval(
              env.registry,
              ticket,
              { kind: "archive", tickets, ...reasonInput },
              (id) => (many ? selectionView?.(ticket.slug, id) : row?.remove)
            )
            if (many) clearSelection?.()
            env.close()
            return
          }
          const failed = failureOf(await archive(reasonInput))
          if (failed !== null) {
            setFailure(failed)
            return
          }
          env.close()
        })
      }}
    />
  )
}

// Flagging from cmd+k: type an optional reason, then pick the action. The
// ticket menu's flag popover does the same on the page.
export function TicketFlagPage({
  ticket,
  context,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const editSelection = scopeSelectionUpdate(useAtomValue(commandScopes))
  const { userId } = useAtomValue(
    projectActor(projectRequest(ticket.orgSlug, ticket.slug))
  )
  const update = useAtomSet(
    updateTicketDetail(
      ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)
    ),
    { mode: "promiseExit" }
  )
  const updateMany = useAtomSet(
    bulkUpdateTickets({ orgSlug: ticket.orgSlug, slug: ticket.slug }),
    { mode: "promiseExit" }
  )
  const many = context.selection.length > 1
  const [reason, setReason] = useState("")
  const [failure, setFailure] = useState<string | null>(null)
  const run = useCommandAction()
  const trimmed = reason.trim()
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_flag_reason_placeholder()}
      onBack={onBack}
      filter={false}
      onSearchChange={setReason}
      notice={failure}
      items={[
        {
          value: FLAG,
          label: many
            ? m.tickets_menu_flag_many({ count: context.selection.length })
            : trimmed === ""
              ? m.tickets_command_flag_action({ id: ticket.ticketId })
              : m.tickets_command_flag_with_reason({ id: ticket.ticketId }),
          icon: Flag
        }
      ]}
      renderItem={(item) => (
        <CommandMenuItem value={item.value}>
          <span className="min-w-0 flex-1 truncate">
            {many ? (
              item.label
            ) : (
              <TicketIdText id={ticket.ticketId}>{item.label}</TicketIdText>
            )}
          </span>
        </CommandMenuItem>
      )}
      onSelect={async () => {
        if (many && editSelection !== null) {
          void editSelection(
            ticket.slug,
            context.selection.map((each) => each.id),
            { flag: trimmed === "" ? {} : { reason: trimmed } }
          )
          env.close()
          return
        }
        await run(async () => {
          setFailure(null)
          const failed = many
            ? failureOf(
                await updateMany({
                  tickets: context.selection.map((each) => each.id),
                  patch: { flag: trimmed === "" ? {} : { reason: trimmed } }
                })
              )
            : failureOf(
                await update({
                  flag: flagFor(
                    trimmed,
                    userId,
                    DateTime.toDate(DateTime.nowUnsafe())
                  )
                })
              )
          if (failed !== null) {
            setFailure(failed)
            return
          }
          env.close()
        })
      }}
    />
  )
}

export function TicketDeletePage({
  ticket,
  context,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const scopes = useAtomValue(commandScopes)
  const row = pointedAt(commandMenuRow(useAtomValue(commandMenuState)), ticket)
  const many = context.selection.length > 1
  const description = m.tickets_command_delete_description()
  const count = many ? 0 : (context.ticketDetail?.subTicketCount ?? 0)
  return (
    <CommandFrame
      chip={chip}
      placeholder={description}
      description={description}
      onBack={onBack}
      items={[
        {
          value: DELETE,
          label: many
            ? m.tickets_row_delete_many_menu_item({
                count: context.selection.length
              })
            : m.tickets_command_delete_action({ id: ticket.ticketId }),
          icon: Trash2
        },
        ...(count === 0
          ? []
          : [
              {
                value: DELETE_CASCADE,
                label: isEpic(context.ticketDetail)
                  ? m.tickets_command_delete_epic_cascade_action({
                      id: ticket.ticketId,
                      count
                    })
                  : m.tickets_command_delete_cascade_action({
                      id: ticket.ticketId,
                      count
                    }),
                icon: Trash2
              }
            ])
      ]}
      onSelect={(item) => {
        const tickets = many
          ? context.selection.map((each) => each.id)
          : [ticket.ticketId]
        const leavingTicket = window.location.pathname.endsWith(
          `/tickets/${ticket.ticketId}`
        )
        const selectionView = scopes.findLast(
          (scope) => scope.selection?.() != null
        )?.removalView
        void runTicketRemoval(
          env.registry,
          ticket,
          {
            kind: "delete",
            tickets,
            cascadeSubTickets: item.value === DELETE_CASCADE
          },
          (id) =>
            many
              ? selectionView?.(ticket.slug, id)
              : leavingTicket
                ? undefined
                : row?.remove
        )
        if (many) scopeSelectionClear(scopes)?.()
        env.close()
        if (leavingTicket) {
          env.navigate(`/orgs/${ticket.orgSlug}/projects/${ticket.slug}`)
        }
      }}
      renderItem={(item) => (
        <CommandMenuItem value={item.value} variant="destructive">
          <span className="min-w-0 flex-1 truncate">
            <TicketIdText id={ticket.ticketId}>{item.label}</TicketIdText>
          </span>
        </CommandMenuItem>
      )}
    />
  )
}
