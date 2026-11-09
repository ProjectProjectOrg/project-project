import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  ESTIMATE_SIZES,
  TicketType,
  type Estimate,
  type Ticket
} from "@pp/shared"
import { useDebouncedValue } from "@tanstack/react-pacer"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { CircleSlash, Layers, Trash2 } from "lucide-react"
import { useState } from "react"

import { CommandMenuCheck, CommandMenuItem } from "@/components/ui/command-menu"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { TicketContext } from "@/features/command-menu/lib/commandMenu"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import {
  deleteTicket,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import {
  searchRequest,
  ticketSearch
} from "@/features/tickets/atoms/ticketSearch"
import {
  formatEstimate,
  parseEstimateMinutes,
  parseEstimatePoints
} from "@/features/tickets/lib/estimateMeta"
import { TYPE_LABELS, TYPE_META } from "@/features/tickets/lib/ticketMeta"
import { errorMessage } from "@/lib/errorMessage"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useTicketMutation } from "./useTicketMutation"

export type TicketPageProps = CommandPageProps &
  Readonly<{ ticket: TicketContext }>

const CLEAR = "clear"
const POINT_PRESETS = [1, 2, 3, 5, 8, 13] as const
const MINUTE_PRESETS = [30, 60, 120, 240, 480] as const

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
  const result = useAtomValue(tagsFor(tagsRequest(ticket.orgSlug, ticket.slug)))
  const tags = Result.isSuccess(result) ? result.value : []
  const applied = current?.tags ?? []
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_tags_placeholder()}
      onBack={onBack}
      items={tags.map((tag) => ({ value: tag.name, label: tag.name }))}
      onSelect={(item) => {
        const tag = tags.find((candidate) => candidate.name === item.value)
        if (tag === undefined) return
        update({
          tags: applied.includes(tag.name)
            ? applied.filter((name) => name !== tag.name)
            : [...applied, tag.name]
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
  const [search, setSearch] = useState("")
  const [debounced] = useDebouncedValue(search.trim(), { wait: 150 })
  const result = useAtomValue(
    ticketSearch(
      searchRequest(ticket.orgSlug, ticket.slug, {
        q: debounced === "" ? undefined : debounced,
        limit: 40
      })
    )
  )
  const epics: ReadonlyArray<Ticket> = Result.isSuccess(result)
    ? result.value.filter(
        (candidate) =>
          candidate.type === "epic" && candidate.id !== ticket.ticketId
      )
    : []
  const parent = current?.parent ?? null
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_parent_placeholder()}
      onBack={onBack}
      filter={false}
      onSearchChange={setSearch}
      items={[
        ...epics.map((epic) => ({
          value: epic.id,
          label: `${epic.id} ${epic.title}`,
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
          if (epic !== undefined) update({ parent: epic.id })
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
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
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

export function TicketDeletePage({
  ticket,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const remove = useAtomSet(
    deleteTicket(ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)),
    { mode: "promiseExit" }
  )
  const [failure, setFailure] = useState<string | null>(null)
  const description = m.tickets_command_delete_description()
  return (
    <CommandFrame
      chip={chip}
      placeholder={description}
      description={description}
      onBack={onBack}
      notice={failure}
      items={[
        {
          value: "delete",
          label: m.tickets_command_delete_action({ id: ticket.ticketId }),
          icon: Trash2
        }
      ]}
      onSelect={async () => {
        setFailure(null)
        const exit = await remove({})
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
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </CommandMenuItem>
      )}
    />
  )
}
