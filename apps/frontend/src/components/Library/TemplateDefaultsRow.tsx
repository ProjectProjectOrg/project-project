import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type {
  Library,
  TemplateKey,
  TicketType,
  UpdateTemplateDefaultsInput
} from "@pp/shared"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { ChevronDown } from "lucide-react"
import { useState } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { TYPE_LABELS, TYPE_META } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BlockIconGlyph } from "./BlockIconGlyph"
import { defaultState, TICKET_TYPES, type DefaultState } from "./libraryModel"
import { failureText } from "./LibraryRow"
import { setDefaultsAtom, type LibraryScope } from "./libraryScope"
import { LibrarySectionHeader } from "./LibrarySection"

export function TemplateDefaultsRow({
  scope,
  library
}: Readonly<{ scope: LibraryScope; library: Library }>) {
  const [error, setError] = useState<string | null>(null)

  const headingId = "library-defaults-heading"

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <LibrarySectionHeader
        id={headingId}
        title={m.templates_settings_defaults_label()}
        description={
          scope.layer === "org"
            ? m.templates_settings_defaults_description_org()
            : m.templates_settings_defaults_description()
        }
      />
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-background">
        {TICKET_TYPES.map((type) => (
          <DefaultRow
            key={type}
            scope={scope}
            type={type}
            library={library}
            state={defaultState(library, scope.layer, type)}
            onSettled={setError}
          />
        ))}
      </ul>
      {error === null ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}

const templateName = (library: Library, key: TemplateKey | null): string =>
  (key === null
    ? undefined
    : library.templates.find((entry) => entry.key === key)?.name) ??
  m.templates_creator_blank()

const templateOf = (library: Library, key: TemplateKey | null) =>
  key === null
    ? undefined
    : library.templates.find((entry) => entry.key === key)

function DefaultRow({
  scope,
  type,
  library,
  state,
  onSettled
}: Readonly<{
  scope: LibraryScope
  type: TicketType
  library: Library
  state: DefaultState
  onSettled: (error: string | null) => void
}>) {
  const mutation = setDefaultsAtom(scope, type)
  const setDefaults = useAtomSet(mutation, { mode: "promiseExit" })
  const { waiting } = useAtomValue(mutation)
  const update = async (input: UpdateTemplateDefaultsInput) =>
    onSettled(failureText(AsyncResult.fromExit(await setDefaults(input))))
  const onPick = (key: TemplateKey | null) =>
    void update({ defaults: { [type]: key } })
  const onInherit = () => void update({ defaults: {}, reset: [type] })
  const choices = library.templates.filter((entry) => !entry.hidden)
  const current = templateOf(library, library.defaults[type])
  const TypeIcon = TYPE_META[type].icon
  const value = (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-2 text-sm",
        current === undefined ? "text-muted-foreground" : "text-foreground",
        waiting && "animate-pulse"
      )}
    >
      {current === undefined ? (
        <span className="size-4 shrink-0" aria-hidden />
      ) : (
        <BlockIconGlyph icon={current.icon} color={current.color} />
      )}
      <span className="truncate">
        {templateName(library, library.defaults[type])}
      </span>
    </span>
  )

  return (
    <li
      data-default-type={type}
      data-default-state={state}
      className="flex min-h-11 items-center justify-between gap-4 px-3 py-1.5"
    >
      <span className="flex items-center gap-2 text-sm">
        <TypeIcon
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
        />
        {TYPE_LABELS[type]()}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        {state === "inherited" ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {m.templates_settings_defaults_inherited()}
          </span>
        ) : null}
        {library.canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={m.templates_settings_defaults_aria({
                type: TYPE_LABELS[type]()
              })}
              className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 transition-all duration-100 hover:bg-accent active:scale-[0.97] data-[popup-open]:bg-accent"
            >
              {value}
              <ChevronDown
                className="size-3.5 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-56">
              {choices.map((entry) => (
                <DropdownMenuItem
                  key={entry.key}
                  onClick={() => onPick(entry.key)}
                  className="cursor-pointer"
                >
                  <BlockIconGlyph icon={entry.icon} color={entry.color} />
                  {entry.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={() => onPick(null)}
                className="cursor-pointer"
              >
                <span className="size-4 shrink-0" aria-hidden />
                {m.templates_creator_blank()}
              </DropdownMenuItem>
              {state === "overridden" ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onInherit}
                    className="cursor-pointer"
                  >
                    <span className="size-4 shrink-0" aria-hidden />
                    {m.templates_settings_defaults_use_org({
                      name: templateName(
                        library,
                        library.inheritedDefaults[type]
                      )
                    })}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="px-2">{value}</span>
        )}
      </span>
    </li>
  )
}
