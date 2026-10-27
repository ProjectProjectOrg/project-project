import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Library, TemplateKey, TicketDetail } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { LayoutTemplate } from "lucide-react"
import { useId, useMemo, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import {
  SegmentedTabs,
  type SegmentedItem
} from "@/components/ui/segmented-tabs"
import { lookupFor } from "@/features/editor/lib/blockChrome"
import {
  projectLibraryFor,
  projectLibraryRequest
} from "@/features/library/atoms/library"
import {
  createTemplateAtom,
  orgScope,
  projectScope,
  type LibraryLayer,
  type LibraryScope
} from "@/features/library/atoms/libraryScope"
import { LibraryEntryLink } from "@/features/library/components/LibraryEntryLink"
import { failureText } from "@/features/library/components/LibraryRow"
import { TYPE_LABELS } from "@/features/tickets/lib/ticketMeta"
import { useOrgActor } from "@/lib/access"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import {
  lookupForLayer,
  saveAsTemplateDraft,
  saveAsTemplateSummary
} from "./saveAsTemplate"

type SaveAsTemplateProps = Readonly<{
  orgSlug: string
  slug: string
  ticket: Pick<TicketDetail, "type" | "priority" | "tags">
  body: string
}>

const scopeFor = (
  layer: LibraryLayer,
  orgSlug: string,
  slug: string
): LibraryScope =>
  layer === "org" ? orgScope(orgSlug) : projectScope(orgSlug, slug)

export function SaveAsTemplatePopover(props: SaveAsTemplateProps) {
  const libraryResult = useAtomValue(
    projectLibraryFor(projectLibraryRequest(props.orgSlug, props.slug))
  )
  const orgAdmin = useOrgActor(props.orgSlug).call(
    "library",
    "createOrgTemplate"
  )
  if (!AsyncResult.isSuccess(libraryResult)) return null
  const library = libraryResult.value
  const layers: ReadonlyArray<LibraryLayer> = [
    ...(library.canEdit ? (["project"] as const) : []),
    ...(orgAdmin ? (["org"] as const) : [])
  ]
  if (layers.length === 0) return null
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.templates_save_as_action()}
            title={m.templates_save_as_action()}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <LayoutTemplate strokeWidth={1.75} />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72">
        <SaveAsTemplateForm {...props} library={library} layers={layers} />
      </PopoverContent>
    </Popover>
  )
}

export function SaveAsTemplateForm({
  orgSlug,
  slug,
  ticket,
  body,
  library,
  layers
}: SaveAsTemplateProps &
  Readonly<{ library: Library; layers: ReadonlyArray<LibraryLayer> }>) {
  const [layer, setLayer] = useState<LibraryLayer>(layers[0] ?? "project")
  const [name, setName] = useState(() => TYPE_LABELS[ticket.type]())
  const [includePriority, setIncludePriority] = useState(false)
  const [includeTags, setIncludeTags] = useState(false)
  const [saved, setSaved] = useState<TemplateKey | null>(null)
  const nameId = useId()
  const scope = scopeFor(layer, orgSlug, slug)
  const mutation = createTemplateAtom(scope)
  const create = useAtomSet(mutation, { mode: "promiseExit" })
  const state = useAtomValue(mutation)
  const error = failureText(state)
  const lookup = useMemo(
    () => lookupForLayer(lookupFor(library), layer),
    [layer, library]
  )
  const summary = saveAsTemplateSummary(body, lookup)
  const taken = useMemo(
    () => new Set(library.templates.map((template) => template.key)),
    [library.templates]
  )
  const canSubmit = name.trim() !== "" && !state.waiting

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    const draft = saveAsTemplateDraft(
      { ...ticket, body },
      { name, includePriority, includeTags },
      lookup,
      taken
    )
    const exit = await create(draft)
    if (Exit.isSuccess(exit)) setSaved(draft.key)
  }

  if (saved !== null)
    return (
      <p
        data-save-as-template-saved
        className="flex items-center gap-1.5 text-[13px]"
      >
        <span>{m.templates_save_as_saved()}</span>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <LibraryEntryLink
          scope={scope}
          kind="template"
          entryKey={saved}
          className="text-foreground underline-offset-2 transition-colors hover:underline"
        >
          {m.templates_save_as_open()}
        </LibraryEntryLink>
      </p>
    )

  const layerItems: ReadonlyArray<SegmentedItem<LibraryLayer>> = layers.map(
    (key) => ({
      key,
      label:
        key === "project"
          ? m.templates_save_as_scope_project()
          : m.templates_save_as_scope_org()
    })
  )

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3"
      aria-label={m.templates_save_as_action()}
    >
      <p className="text-[13px] font-medium">{m.templates_save_as_action()}</p>
      <div className="flex flex-col gap-1">
        <label htmlFor={nameId} className="text-xs text-muted-foreground">
          {m.templates_save_as_name_label()}
        </label>
        <Input
          id={nameId}
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      {layerItems.length > 1 ? (
        <SegmentedTabs
          variant="inline"
          className="self-start"
          items={layerItems}
          value={layer}
          onValueChange={setLayer}
        />
      ) : null}
      <div className="flex flex-col gap-1.5">
        <IncludeToggle
          label={m.templates_save_as_include_priority()}
          checked={includePriority}
          onChange={setIncludePriority}
        />
        <IncludeToggle
          label={m.templates_save_as_include_tags()}
          checked={includeTags}
          onChange={setIncludeTags}
        />
      </div>
      <p data-save-as-summary className="text-xs text-muted-foreground">
        {m.templates_save_as_summary({
          blocks:
            summary.blocks === 1
              ? m.templates_save_as_blocks_one()
              : m.templates_save_as_blocks({ count: summary.blocks }),
          customized: summary.customized
        })}
      </p>
      {error === null ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button
        type="submit"
        size="sm"
        disabled={!canSubmit}
        className={cn("self-end", state.waiting && "animate-pulse")}
      >
        {m.templates_save_as_submit()}
      </Button>
    </form>
  )
}

function IncludeToggle({
  label,
  checked,
  onChange
}: Readonly<{
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}>) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  )
}
