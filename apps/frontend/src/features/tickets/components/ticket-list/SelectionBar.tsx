import { RegistryContext, useAtomValue } from "@effect/atom-react"
import { useParams } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { Command, X } from "lucide-react"
import { motion, useIsPresent } from "motion/react"
import { use } from "react"

import { Button } from "@/components/ui/button"
import { Freeze } from "@/components/ui/freeze"
import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import {
  openCommandMenu,
  type SelectedTicket
} from "@/features/command-menu/lib/commandMenu"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import {
  projectOfKey,
  suggestedStatus
} from "@/features/tickets/lib/ticketSelection"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { type SelectionStore, updateSelected } from "./selectionStore"

export function SelectionBar({
  store,
  onClear
}: Readonly<{ store: SelectionStore; onClear: () => void }>) {
  const count = useAtomValue(store.count)
  const present = useIsPresent()
  return (
    <div className="pointer-events-none sticky bottom-6 z-30 flex h-0 items-end justify-center">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={transitions.presence}
        className="pointer-events-auto flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-surface-5 pr-1.5 pl-4 shadow-surface-6"
      >
        <Freeze frozen={!present}>
          <output className="text-body whitespace-nowrap text-foreground tabular-nums">
            {m.tickets_selection_count({ count })}
          </output>
          <SelectionActions store={store} />
        </Freeze>
        <SelectionFailureNotice store={store} />
        <Button
          type="button"
          variant="quiet"
          size="square-8"
          onClick={onClear}
          aria-label={m.tickets_selection_clear_aria_label()}
          title={m.tickets_selection_clear_aria_label()}
        >
          <X className="size-4" strokeWidth={1.75} />
        </Button>
      </motion.div>
    </div>
  )
}

function SelectionFailureNotice({
  store
}: Readonly<{ store: SelectionStore }>) {
  const failure = useAtomValue(store.failure)
  if (failure === null) return null
  return (
    <>
      <span
        role="alert"
        className="text-body whitespace-nowrap text-destructive"
      >
        {m.tickets_selection_failed({ count: failure.count })}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={failure.retry}
      >
        {m.tickets_selection_retry()}
      </Button>
    </>
  )
}

function SelectionActions({ store }: Readonly<{ store: SelectionStore }>) {
  const { orgSlug } = useParams({ strict: false })
  const keys = [...useAtomValue(store.selection).keys]
  const known = useAtomValue(store.known)
  const [first] = keys
  if (orgSlug === undefined || first === undefined) return null
  return (
    <SelectionButtons
      store={store}
      orgSlug={orgSlug}
      slug={projectOfKey(first)}
      tickets={keys.flatMap((key) => known.get(key) ?? [])}
    />
  )
}

function SelectionButtons({
  store,
  orgSlug,
  slug,
  tickets
}: Readonly<{
  store: SelectionStore
  orgSlug: string
  slug: string
  tickets: ReadonlyArray<SelectedTicket>
}>) {
  const registry = use(RegistryContext)
  const result = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const statuses = Result.isSuccess(result) ? result.value : []
  const next = suggestedStatus(
    tickets.map((ticket) => ticket.status),
    statuses.map((status) => status.slug)
  )
  const [first] = tickets
  const meta = next === null ? null : statusMetaFor(next, statuses)
  const Icon = meta?.icon
  return (
    <>
      {next !== null && meta !== null && Icon !== undefined && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            updateSelected(
              registry,
              store,
              slug,
              tickets.map((ticket) => ticket.id),
              { status: next }
            )
          }
        >
          <Icon
            className={cn("size-3.5", meta.className)}
            style={meta.color ? { color: meta.color } : undefined}
            strokeWidth={1.75}
          />
          {m.tickets_selection_move_to({ status: meta.label })}
        </Button>
      )}
      {first !== undefined && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            registry.set(
              commandMenuState,
              openCommandMenu(
                { orgSlug, slug, ticketId: first.id },
                "root",
                tickets
              )
            )
          }
        >
          <Command className="size-3.5" strokeWidth={1.75} />
          {m.tickets_selection_actions()}
        </Button>
      )}
    </>
  )
}
