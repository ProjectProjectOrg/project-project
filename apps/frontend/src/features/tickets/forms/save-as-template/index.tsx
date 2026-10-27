import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Library, TemplateKey, TicketDetail } from "@pp/shared"
import * as Exit from "effect/Exit"
import { useId, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  SegmentedTabs,
  type SegmentedItem
} from "@/components/ui/segmented-tabs"
import { lookupFor } from "@/features/editor/lib/blockChrome"
import {
  createTemplateAtom,
  orgScope,
  projectScope,
  type LibraryLayer,
  type LibraryScope
} from "@/features/library/atoms/libraryScope"
import { LibraryEntryLink } from "@/features/library/components/LibraryEntryLink"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  lookupForLayer,
  saveAsTemplateDraft,
  saveAsTemplateSummary
} from "@/features/tickets/lib/saveAsTemplate"
import { TYPE_LABELS } from "@/features/tickets/lib/ticketMeta"
import { useAppForm, useFormValues } from "@/lib/form"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { saveAsTemplateFormOpts } from "./opts"

export type SaveAsTemplateProps = Readonly<{
  ticket: Pick<TicketDetail, "type" | "priority" | "tags">
  body: string
}>

const scopeFor = (
  layer: LibraryLayer,
  orgSlug: string,
  slug: string
): LibraryScope =>
  layer === "org" ? orgScope(orgSlug) : projectScope(orgSlug, slug)

export function SaveAsTemplateForm({
  ticket,
  body,
  library,
  layers
}: SaveAsTemplateProps &
  Readonly<{ library: Library; layers: ReadonlyArray<LibraryLayer> }>) {
  const { orgSlug, slug } = useProjectRoute()
  const [saved, setSaved] = useState<TemplateKey | null>(null)
  const nameId = useId()
  const taken = useMemo(
    () => new Set(library.templates.map((template) => template.key)),
    [library.templates]
  )
  const createInProject = useAtomSet(
    createTemplateAtom(scopeFor("project", orgSlug, slug)),
    { mode: "promiseExit" }
  )
  const createInOrg = useAtomSet(
    createTemplateAtom(scopeFor("org", orgSlug, slug)),
    { mode: "promiseExit" }
  )
  const form = useAppForm({
    ...saveAsTemplateFormOpts,
    defaultValues: {
      ...saveAsTemplateFormOpts.defaultValues,
      name: TYPE_LABELS[ticket.type](),
      layer: layers[0] ?? "project"
    },
    onSubmit: async ({ value }) => {
      const draft = saveAsTemplateDraft(
        { ...ticket, body },
        value,
        lookupForLayer(lookupFor(library), value.layer),
        taken
      )
      const create = value.layer === "org" ? createInOrg : createInProject
      const exit = await create(draft)
      if (Exit.isSuccess(exit)) setSaved(draft.key)
    }
  })
  const values = useFormValues(form)
  const scope = scopeFor(values.layer, orgSlug, slug)
  const state = useAtomValue(createTemplateAtom(scope))
  const error = mutationErrorText(state)
  const lookup = useMemo(
    () => lookupForLayer(lookupFor(library), values.layer),
    [values.layer, library]
  )
  const summary = saveAsTemplateSummary(body, lookup)

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
      onSubmit={(event) => {
        event.preventDefault()
        if (!state.waiting) void form.handleSubmit()
      }}
      className="flex flex-col gap-3"
      aria-label={m.templates_save_as_action()}
    >
      <p className="text-[13px] font-medium">{m.templates_save_as_action()}</p>
      <form.Field name="name">
        {(field) => (
          <div className="flex flex-col gap-1">
            <label htmlFor={nameId} className="text-xs text-muted-foreground">
              {m.templates_save_as_name_label()}
            </label>
            <Input
              id={nameId}
              value={field.value}
              maxLength={60}
              aria-invalid={field.errors.length > 0}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
            />
            {field.errors.length > 0 ? (
              <p role="alert" className="text-xs text-destructive">
                {m.validation_required()}
              </p>
            ) : null}
          </div>
        )}
      </form.Field>
      {layerItems.length > 1 ? (
        <form.Field name="layer">
          {(field) => (
            <SegmentedTabs
              variant="inline"
              className="self-start"
              items={layerItems}
              value={field.value}
              onValueChange={field.handleChange}
            />
          )}
        </form.Field>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <form.Field name="includePriority">
          {(field) => (
            <IncludeToggle
              label={m.templates_save_as_include_priority()}
              checked={field.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
        <form.Field name="includeTags">
          {(field) => (
            <IncludeToggle
              label={m.templates_save_as_include_tags()}
              checked={field.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
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
        disabled={state.waiting}
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
