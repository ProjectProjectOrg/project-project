import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { ESTIMATE_SIZES, TagName, TicketType, type Estimate } from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { Archive, CircleSlash, Layers, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { CommandMenuCheck, CommandMenuItem } from "@/components/ui/command-menu"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { TicketContext } from "@/features/command-menu/lib/commandMenu"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import {
  projectActor,
  projectRequest
} from "@/features/projects/atoms/projects"
import { createTag, tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { epicsRequest, projectEpics } from "@/features/tickets/atoms/epics"
import {
  archiveTicket,
  deleteTicket,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketIdText } from "@/features/tickets/components/TicketIdText"
import {
  formatEstimate,
  parseEstimateMinutes,
  parseEstimatePoints
} from "@/features/tickets/lib/estimateMeta"
import { TYPE_LABELS, TYPE_META } from "@/features/tickets/lib/ticketMeta"
import { parentRef } from "@/features/tickets/lib/ticketPatch"
import { errorMessage } from "@/lib/errorMessage"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useTicketMutation } from "./useTicketMutation"

export type TicketPageProps = CommandPageProps &
  Readonly<{ ticket: TicketContext }>

const CLEAR = "clear"
const CREATE_TAG = "create-tag"
const ARCHIVE = "archive"
const DELETE = "delete"
const DELETE_CASCADE = "delete-cascade"
const POINT_PRESETS = [1, 2, 3, 5, 8, 13] as const
const MINUTE_PRESETS = [30, 60, 120, 240, 480] as const

const decodeTagName = Schema.decodeUnknownOption(TagName)

const sameEstimate = (a: Estimate | null, b: Estimate) =>
  a !== null && formatEstimate(a) === formatEstimate(b) && a.unit === b.unit

const estimateOptions = (
  mode: "points" | "tshirt" | "time",
  query: string
): ReadonlyArray<Estimate> => {
  if (mode === "tshirt") {
    return ESTIMATE_SIZES.map((value) => ({ unit: "tshirt", value }))
  }
  if (mode === "points") {
    const typed = parseEstimatePoints(query)
    const presets = POINT_PRESETS.map(
      (value): Estimate => ({ unit: "points", value })
    )
    return typed === null || POINT_PRESETS.some((value) => value === typed)
      ? presets
      : [{ unit: "points", value: typed }, ...presets]
  }
  const typed = parseEstimateMinutes(query)
  const presets = MINUTE_PRESETS.map(
    (minutes): Estimate => ({ unit: "time", minutes })
  )
  return typed === null || MINUTE_PRESETS.some((value) => value === typed)
    ? presets
    : [{ unit: "time", minutes: typed }, ...presets]
}

export function TicketEstimatePage({
  ticket,
  context,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const { current, update } = useTicketMutation(ticket)
  const [query, setQuery] = useState("")
  const mode = context.project?.estimation ?? "off"
  if (mode === "off") return null
  const options = estimateOptions(mode, query)
  const byValue = new Map(
    options.map((estimate) => [formatEstimate(estimate), estimate])
  )
  const estimate = current?.estimate ?? null
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
        ...(estimate === null
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
            {option !== undefined && sameEstimate(estimate, option) && (
              <CommandMenuCheck />
            )}
          </CommandMenuItem>
        )
      }}
    />
  )
}

export function TicketTypePage({ ticket, chip, onBack, env }: TicketPageProps) {
  const { current, update } = useTicketMutation(ticket)
  const types = TicketType.literals
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_type_placeholder()}
      onBack={onBack}
      items={types.map((type) => ({
        value: type,
        label: TYPE_LABELS[type](),
        icon: TYPE_META[type].icon
      }))}
      onSelect={(item) => {
        const type = types.find((candidate) => candidate === item.value)
        if (type !== undefined) update({ type })
        env.close()
      }}
      renderItem={(item) => (
        <CommandMenuItem value={item.value}>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {current?.type === item.value && <CommandMenuCheck />}
        </CommandMenuItem>
      )}
    />
  )
}

export function TicketTagsPage({ ticket, chip, onBack }: TicketPageProps) {
  const { current, update } = useTicketMutation(ticket)
  const req = tagsRequest(ticket.orgSlug, ticket.slug)
  const result = useAtomValue(tagsFor(req))
  const create = useAtomSet(createTag(req), { mode: "promiseExit" })
  const canCreate = useAtomValue(
    projectActor(projectRequest(ticket.orgSlug, ticket.slug))
  ).call("tags", "create")
  const [query, setQuery] = useState("")
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
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
          if (Option.isNone(newName) || pending) return
          setPending(true)
          setFailure(null)
          const exit = await create({ name: newName.value })
          setPending(false)
          if (Exit.isSuccess(exit)) update({ tags: { add: [newName.value] } })
          else setFailure(errorMessage(Cause.squash(exit.cause)))
          return
        }
        const tag = tags.find((candidate) => candidate.name === item.value)
        if (tag === undefined) return
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
            {tag !== undefined && applied.includes(tag.name) && (
              <CommandMenuCheck />
            )}
          </CommandMenuItem>
        )
      }}
    />
  )
}

export function TicketParentPage({
  ticket,
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
                <span className="min-w-(--row-key-width) shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
                  {epic.id}
                </span>
                <span className="min-w-0 truncate">{epic.title}</span>
              </span>
            )}
            {epic !== undefined && epic.id === parent && <CommandMenuCheck />}
          </CommandMenuItem>
        )
      }}
    />
  )
}

export function TicketArchivePage({
  ticket,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const archive = useAtomSet(
    archiveTicket(ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)),
    { mode: "promiseExit" }
  )
  const [reason, setReason] = useState("")
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
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
          label:
            trimmed === ""
              ? m.tickets_command_archive_action({ id: ticket.ticketId })
              : m.tickets_command_archive_with_reason({ id: ticket.ticketId }),
          icon: Archive
        }
      ]}
      renderItem={(item) => (
        <CommandMenuItem value={item.value}>
          <span className="min-w-0 flex-1 truncate">
            <TicketIdText id={ticket.ticketId}>{item.label}</TicketIdText>
          </span>
        </CommandMenuItem>
      )}
      onSelect={async () => {
        if (pending) return
        setPending(true)
        setFailure(null)
        const exit = await archive(trimmed === "" ? {} : { reason: trimmed })
        setPending(false)
        if (Exit.isFailure(exit)) {
          setFailure(errorMessage(Cause.squash(exit.cause)))
          return
        }
        env.close()
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
  const remove = useAtomSet(
    deleteTicket(ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)),
    { mode: "promiseExit" }
  )
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const description = m.tickets_command_delete_description()
  const count = context.ticketDetail?.subTicketCount ?? 0
  return (
    <CommandFrame
      chip={chip}
      placeholder={description}
      description={description}
      onBack={onBack}
      notice={failure}
      items={[
        {
          value: DELETE,
          label: m.tickets_command_delete_action({ id: ticket.ticketId }),
          icon: Trash2
        },
        ...(count === 0
          ? []
          : [
              {
                value: DELETE_CASCADE,
                label:
                  context.ticketDetail?.type === "epic"
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
      onSelect={async (item) => {
        if (pending) return
        setPending(true)
        setFailure(null)
        const exit = await remove({
          cascadeSubTickets: item.value === DELETE_CASCADE
        })
        setPending(false)
        if (Exit.isFailure(exit)) {
          setFailure(errorMessage(Cause.squash(exit.cause)))
          return
        }
        env.close()
        if (window.location.pathname.endsWith(`/tickets/${ticket.ticketId}`)) {
          env.navigate(`/orgs/${ticket.orgSlug}/projects/${ticket.slug}`)
        }
      }}
      renderItem={(item) => (
        <CommandMenuItem value={item.value} className={cn("text-destructive")}>
          <span className="min-w-0 flex-1 truncate">
            <TicketIdText id={ticket.ticketId}>{item.label}</TicketIdText>
          </span>
        </CommandMenuItem>
      )}
    />
  )
}
