import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  FALLBACK_BLOCK_ICON,
  type BlockDraft,
  BlockKey,
  type TemplateDraft,
  TemplateKey
} from "@pp/shared"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import { Button } from "@/components/ui/button"
import { useInlineForm } from "@/components/ui/inline-form"
import { Input } from "@/components/ui/input"
import {
  createBlockAtom,
  createTemplateAtom,
  type LibraryScope
} from "@/features/library/atoms/libraryScope"
import { useOpenEntry } from "@/features/library/components/LibraryEntryLink"
import type { LibraryKind } from "@/features/library/lib/libraryModel"
import { useAppForm, useFormValues } from "@/lib/form"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import { effectiveLibraryKey, libraryCreateFormOpts } from "./opts"

export type LibraryCreateProps = Readonly<{
  kind: LibraryKind
  scope: LibraryScope
  taken: ReadonlySet<string>
}>

type CreateResult = AsyncResult.AsyncResult<unknown, Readonly<{ _tag: string }>>

const templateDraft = (key: string, name: string): TemplateDraft => ({
  key: TemplateKey.make(key),
  name,
  icon: "LayoutTemplate",
  color: null,
  description: "",
  priority: null,
  tags: [],
  body: ""
})

const blockDraft = (key: string, name: string): BlockDraft => ({
  key: BlockKey.make(key),
  name,
  icon: FALLBACK_BLOCK_ICON,
  color: null,
  description: "",
  sync: false,
  content: `## ${name}`
})

export function LibraryCreateForm(props: LibraryCreateProps) {
  return props.kind === "template" ? (
    <TemplateCreateForm {...props} />
  ) : (
    <BlockCreateForm {...props} />
  )
}

function TemplateCreateForm(props: LibraryCreateProps) {
  const mutation = createTemplateAtom(props.scope)
  const create = useAtomSet(mutation, { mode: "promiseExit" })
  const state = useAtomValue(mutation)
  return (
    <CreateFields
      {...props}
      state={state}
      submit={(key, name) => create(templateDraft(key, name))}
    />
  )
}

function BlockCreateForm(props: LibraryCreateProps) {
  const mutation = createBlockAtom(props.scope)
  const create = useAtomSet(mutation, { mode: "promiseExit" })
  const state = useAtomValue(mutation)
  return (
    <CreateFields
      {...props}
      state={state}
      submit={(key, name) => create(blockDraft(key, name))}
    />
  )
}

function CreateFields({
  kind,
  scope,
  taken,
  state,
  submit
}: LibraryCreateProps &
  Readonly<{
    state: CreateResult
    submit: (
      key: string,
      name: string
    ) => Promise<Exit.Exit<unknown, Readonly<{ _tag: string }>>>
  }>) {
  const { close } = useInlineForm()
  const openEntry = useOpenEntry(scope)
  const busy = state.waiting
  const failure = busy ? null : mutationErrorText(state)
  const form = useAppForm({
    ...libraryCreateFormOpts(kind, taken),
    onSubmit: async ({ value }) => {
      const key = effectiveLibraryKey(value)
      const exit = await submit(key, value.name.trim())
      if (!Exit.isSuccess(exit)) return
      close()
      openEntry(kind, key)
    }
  })
  const values = useFormValues(form)
  const trimmed = values.name.trim()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        if (trimmed.length === 0) close()
        else void form.handleSubmit()
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return
        event.preventDefault()
        if (!busy) close()
      }}
      className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <form.Field name="name">
          {(field) => (
            <Input
              autoFocus
              value={field.value}
              disabled={busy}
              maxLength={60}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              placeholder={
                kind === "template"
                  ? m.templates_settings_new_template_placeholder()
                  : m.templates_settings_new_block_placeholder()
              }
              className="h-8 w-64 max-w-full rounded-md"
            />
          )}
        </form.Field>
        <form.Field name="key">
          {(field) => (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {m.templates_settings_key_label()}
              <Input
                value={effectiveLibraryKey(values)}
                disabled={busy}
                maxLength={48}
                spellCheck={false}
                aria-invalid={field.errors.length > 0}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                className="h-8 w-48 rounded-md font-mono text-xs"
              />
            </label>
          )}
        </form.Field>
        <span className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={close}
          >
            {m.templates_settings_cancel()}
          </Button>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={busy || trimmed.length === 0}
          >
            {m.templates_settings_create()}
          </Button>
        </span>
      </div>
      <form.Field name="key">
        {(field) => {
          const problem =
            trimmed.length > 0 && !busy ? field.errors[0]?.message : undefined
          const error = problem ?? failure
          return error === null ? null : (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )
        }}
      </form.Field>
    </form>
  )
}
