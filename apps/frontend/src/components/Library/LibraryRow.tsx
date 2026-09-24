import type { BlockIconName, LibraryOrigin } from "@pp/shared"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { ChevronRight } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useState, type ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmButton, useConfirmButton } from "@/components/ui/confirm-button"
import { errorMessage, type AppError } from "@/lib/errorMessage"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BlockIconGlyph } from "./BlockIconGlyph"
import { LibraryEntryLink } from "./LibraryEntryLink"
import { layoutIdFor, type LibraryKind, type RowAction } from "./libraryModel"
import type { LibraryScope } from "./libraryScope"

export type LibraryRowEntry = Readonly<{
  key: string
  name: string
  icon: BlockIconName
  color: string | null
  origin: LibraryOrigin
  shadows: LibraryOrigin | null
}>

const ORIGIN_LABELS: Readonly<Record<LibraryOrigin, () => string>> = {
  org: () => m.templates_settings_origin_org(),
  project: () => m.templates_settings_origin_project()
}

export const originLabel = (entry: LibraryRowEntry): string =>
  entry.shadows === null
    ? ORIGIN_LABELS[entry.origin]()
    : m.templates_settings_overrides({
        origin: ORIGIN_LABELS[entry.origin](),
        shadowed: ORIGIN_LABELS[entry.shadows]()
      })

const ACTION_LABELS: Readonly<Record<RowAction, () => string>> = {
  customize: () => m.templates_settings_action_customize(),
  duplicate: () => m.templates_settings_action_duplicate(),
  hide: () => m.templates_settings_action_hide(),
  reset: () => m.templates_settings_action_reset(),
  delete: () => m.templates_settings_action_delete()
}

type LibraryCardProps = Readonly<{
  kind: LibraryKind
  scope: LibraryScope
  entry: LibraryRowEntry & Readonly<{ description: string }>
  strip?: ReactNode
  badge?: ReactNode
  actions: ReadonlyArray<RowAction>
  onAction: (action: RowAction) => Promise<boolean>
  waiting: boolean
  error: string | null
  fresh?: boolean
}>

export function useFreshKeys(
  keys: ReadonlyArray<string>
): (key: string) => boolean {
  const [initial] = useState(() => new Set(keys))
  return (key) => !initial.has(key)
}

/**
 * Whether the origin is worth a badge: every entry on the org page is the
 * org's, so only entries from another layer, or ones overriding it, say so.
 */
export const showsOrigin = (
  entry: LibraryRowEntry,
  layer: LibraryOrigin
): boolean => entry.origin !== layer || entry.shadows !== null

/**
 * One of this layer's templates or blocks. It reads like a gallery tile but
 * sits on the page instead of in the gallery well, carries the origin as a
 * badge, and opens its editor. Actions show on hover or focus.
 */
export function LibraryCard({
  kind,
  scope,
  entry,
  strip,
  badge,
  actions,
  onAction,
  waiting,
  error,
  fresh = false
}: LibraryCardProps) {
  return (
    <motion.li
      layout
      layoutId={layoutIdFor(kind, entry.key)}
      data-library-card={entry.key}
      data-fresh={fresh ? "" : undefined}
      style={{ borderRadius: 16 }}
      className="group/reveal relative flex list-none flex-col gap-1.5 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40 motion-safe:data-[fresh]:animate-[ticket-block-flash_900ms_ease-out]"
    >
      <LibraryEntryLink
        scope={scope}
        kind={kind}
        entryKey={entry.key}
        aria-label={entry.name}
        className="absolute inset-0 rounded-lg focus-visible:ring-1 focus-visible:ring-[#6B97FF] focus-visible:outline-none"
      />
      <motion.div
        layout="position"
        className={cn(
          "pointer-events-none flex items-center gap-2",
          waiting && "animate-pulse"
        )}
      >
        <BlockIconGlyph icon={entry.icon} color={entry.color} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {entry.name}
        </span>
        {badge}
        {showsOrigin(entry, scope.layer) ? (
          <Badge size="xs" data-origin>
            {originLabel(entry)}
          </Badge>
        ) : null}
      </motion.div>
      <motion.p
        layout="position"
        className="pointer-events-none truncate text-xs text-muted-foreground"
      >
        {entry.description === "" ? "\u00a0" : entry.description}
      </motion.p>
      {strip === undefined ? null : (
        <motion.div layout="position" className="pointer-events-none">
          {strip}
        </motion.div>
      )}
      {error === null ? null : (
        <p role="alert" className="relative text-xs text-destructive">
          {error}
        </p>
      )}
      {actions.length > 0 ? (
        <motion.div
          layout="position"
          className="relative mt-auto flex items-center gap-0.5 pt-1 opacity-0 transition-opacity group-focus-within/reveal:opacity-100 group-hover/reveal:opacity-100 has-[[data-confirming]]:opacity-100"
        >
          {actions.map((action) =>
            action === "delete" ? (
              <DeleteAction
                key={action}
                name={entry.name}
                onConfirm={() => onAction(action)}
              />
            ) : (
              <Button
                key={action}
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => void onAction(action)}
              >
                {ACTION_LABELS[action]()}
              </Button>
            )
          )}
        </motion.div>
      ) : null}
    </motion.li>
  )
}

function DeleteAction({
  name,
  onConfirm
}: Readonly<{ name: string; onConfirm: () => Promise<boolean> }>) {
  return (
    <ConfirmButton.Root>
      <ConfirmButton.Trigger type="button" variant="ghost" size="xs">
        {m.templates_settings_action_delete()}
      </ConfirmButton.Trigger>
      <ConfirmButton.Confirm className="gap-1">
        <DeleteConfirmBody name={name} onConfirm={onConfirm} />
      </ConfirmButton.Confirm>
    </ConfirmButton.Root>
  )
}

function DeleteConfirmBody({
  name,
  onConfirm
}: Readonly<{ name: string; onConfirm: () => Promise<boolean> }>) {
  const { close, busy, setBusy } = useConfirmButton()
  return (
    <span data-confirming className="flex flex-wrap items-center gap-1">
      <span className="text-xs text-muted-foreground">
        {m.templates_settings_delete_confirm({ name })}
      </span>
      <Button
        type="button"
        variant="destructive"
        size="xs"
        autoFocus
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const done = await onConfirm()
          if (done) close()
          else setBusy(false)
        }}
      >
        {m.templates_settings_action_delete()}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={busy}
        onClick={close}
      >
        {m.templates_settings_cancel()}
      </Button>
    </span>
  )
}

type HiddenEntry = LibraryRowEntry & Readonly<{ unhide: boolean }>

export function UnhideButton({
  waiting,
  error,
  onUnhide
}: Readonly<{ waiting: boolean; error: string | null; onUnhide: () => void }>) {
  return (
    <span className="flex items-center gap-2">
      {error === null ? null : (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className={cn(waiting && "animate-pulse")}
        onClick={onUnhide}
      >
        {m.templates_settings_action_unhide()}
      </Button>
    </span>
  )
}

export function HiddenEntries({
  entries,
  renderUnhide
}: Readonly<{
  entries: ReadonlyArray<HiddenEntry>
  renderUnhide: (key: string) => ReactNode
}>) {
  const [open, setOpen] = useState(false)
  if (entries.length === 0) return null
  return (
    <div className="flex flex-col">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="self-start"
      >
        <ChevronRight
          className={cn("size-3.5 transition-transform", open && "rotate-90")}
          strokeWidth={1.75}
        />
        {m.templates_settings_hidden_count({ count: entries.length })}
      </Button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={transitions.presence}
            className="flex flex-col overflow-hidden"
          >
            {entries.map((entry) => (
              <li
                key={entry.key}
                data-hidden-row={entry.key}
                className="flex min-h-10 items-center gap-2.5 rounded-md px-3 py-2"
              >
                <BlockIconGlyph
                  icon={entry.icon}
                  color={null}
                  className="opacity-60"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {entry.name}
                </span>
                {entry.unhide ? (
                  renderUnhide(entry.key)
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {m.templates_settings_hidden_in({
                      origin: ORIGIN_LABELS[entry.origin]()
                    })}
                  </span>
                )}
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export const failureText = (
  result: AsyncResult.AsyncResult<unknown, Readonly<{ _tag: string }>>
): string | null =>
  AsyncResult.isFailure(result)
    ? AsyncResult.matchWithError(result, {
        onInitial: () => null,
        onSuccess: () => null,
        onError: (error) => errorMessage(error as AppError),
        onDefect: () => m.error_unknown()
      })
    : null
