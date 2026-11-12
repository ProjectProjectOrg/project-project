import {
  blockLookupFor,
  type BlockDraft,
  type BlockIconName,
  type Library
} from "@pp/shared"
import { Check } from "lucide-react"
import { useId, useMemo, type ReactNode } from "react"

import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { templateSketch } from "../lib/blockSketchModel"
import type { LibraryKind } from "../lib/libraryModel"
import {
  exampleSections,
  exampleTypes,
  libraryWithExamples,
  NEW_TYPE_ICON
} from "../lib/newEntry"
import { BlockIconGlyph } from "./BlockIconGlyph"
import { BlockStrip } from "./BlockSketch"
import { SameOnEveryTicketBadge } from "./EntryBadges"

export type Example = Readonly<{
  key: string
  name: string
  icon: BlockIconName
  color: string | null
  detail: ReactNode
}>

export function useExamples(
  kind: LibraryKind,
  library: Library
): ReadonlyArray<Example> {
  return useMemo(() => {
    if (kind === "section")
      return exampleSections(library).map(
        (draft: BlockDraft): Example => ({
          key: draft.key,
          name: draft.name,
          icon: draft.icon,
          color: draft.color,
          detail: (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{draft.description}</span>
              {draft.sync ? <SameOnEveryTicketBadge /> : null}
            </span>
          )
        })
      )
    const lookup = blockLookupFor(libraryWithExamples(library))
    return exampleTypes(library).map(
      (draft): Example => ({
        key: draft.key,
        name: draft.name,
        icon: draft.icon,
        color: draft.color,
        detail: <BlockStrip blocks={templateSketch(draft.body, lookup, 0)} />
      })
    )
  }, [kind, library])
}

export function ExamplePicker({
  kind,
  examples,
  value,
  disabled,
  onPick
}: Readonly<{
  kind: LibraryKind
  examples: ReadonlyArray<Example>
  value: string | null
  disabled: boolean
  onPick: (key: string | null) => void
}>) {
  const name = useId()
  const empty: Example = {
    key: "",
    name: m.templates_new_empty(),
    icon: kind === "type" ? NEW_TYPE_ICON : "Square",
    color: null,
    detail:
      kind === "type"
        ? m.templates_new_empty_type_detail()
        : m.templates_new_empty_section_detail()
  }
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 px-0.5 text-body font-semibold">
        {m.templates_new_start_from()}
      </legend>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] gap-2">
        {[empty, ...examples].map((example) => {
          const key = example === empty ? null : example.key
          return (
            <ExampleCard
              key={example.key}
              name={name}
              example={example}
              selected={value === key}
              disabled={disabled}
              onPick={() => onPick(key)}
            />
          )
        })}
      </div>
    </fieldset>
  )
}

function ExampleCard({
  name,
  example,
  selected,
  disabled,
  onPick
}: Readonly<{
  name: string
  example: Example
  selected: boolean
  disabled: boolean
  onPick: () => void
}>) {
  return (
    <label
      className={cn(
        "flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-lg border bg-card p-3 transition-all duration-100 hover:bg-hover active:scale-[0.97] has-[:disabled]:cursor-default has-[:disabled]:opacity-70 has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring",
        selected ? "border-foreground" : "border-border"
      )}
    >
      <input
        type="radio"
        name={name}
        checked={selected}
        disabled={disabled}
        onChange={onPick}
        className="sr-only"
      />
      <span className="flex min-w-0 items-center gap-2">
        <BlockIconGlyph icon={example.icon} color={example.color} />
        <span className="min-w-0 flex-1 truncate text-body font-semibold">
          {example.name}
        </span>
        {selected ? (
          <Check aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
        ) : null}
      </span>
      <span className="min-w-0 text-caption text-muted-foreground">
        {example.detail}
      </span>
    </label>
  )
}
