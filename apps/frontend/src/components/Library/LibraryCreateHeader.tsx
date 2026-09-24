import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  FALLBACK_BLOCK_ICON,
  type BlockDraft,
  type BlockKey,
  type TemplateDraft,
  type TemplateKey
} from "@pp/shared"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { Plus } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import { Input } from "@/components/ui/input"
import { m } from "@/paraglide/messages"

import { useOpenEntry } from "./LibraryEntryLink"
import {
  keyFromName,
  keyProblem,
  type KeyProblem,
  type LibraryKind
} from "./libraryModel"
import { failureText } from "./LibraryRow"
import {
  createBlockAtom,
  createTemplateAtom,
  type LibraryScope
} from "./libraryScope"
import { LibrarySectionHeader } from "./LibrarySection"

type CreateRowProps = Readonly<{
  kind: LibraryKind
  scope: LibraryScope
  taken: ReadonlySet<string>
}>

type Heading = Readonly<{ id: string; title: string; description: string }>

/**
 * The section header of a library list with its New button. The button sits
 * in the header, and the form opens right under it, above the cards.
 */
export function LibraryCreateHeader({
  heading,
  ...props
}: CreateRowProps & Readonly<{ heading: Heading }>) {
  const Root = InlineForm.Root<"create">
  return (
    <Root variant="ghost" className="flex flex-col gap-3">
      <LibrarySectionHeader
        {...heading}
        action={
          <InlineForm.Idle>
            <InlineForm.Trigger
              action="create"
              variant="primary"
              size="sm"
              leadingIcon={Plus}
            >
              {props.kind === "template"
                ? m.templates_settings_new_template()
                : m.templates_settings_new_block()}
            </InlineForm.Trigger>
          </InlineForm.Idle>
        }
      />
      <InlineForm.Form action="create" className="space-y-0">
        {props.kind === "template" ? (
          <TemplateCreateFields {...props} />
        ) : (
          <BlockCreateFields {...props} />
        )}
      </InlineForm.Form>
    </Root>
  )
}

const templateDraft = (key: string, name: string): TemplateDraft => ({
  key: key as TemplateKey,
  name,
  icon: "LayoutTemplate",
  color: null,
  description: "",
  type: null,
  priority: null,
  tags: [],
  body: ""
})

const blockDraft = (key: string, name: string): BlockDraft => ({
  key: key as BlockKey,
  name,
  icon: FALLBACK_BLOCK_ICON,
  color: null,
  description: "",
  sync: false,
  content: `## ${name}`
})

function TemplateCreateFields({ scope, taken }: CreateRowProps) {
  const mutation = createTemplateAtom(scope)
  const create = useAtomSet(mutation, { mode: "promiseExit" })
  const state = useAtomValue(mutation)
  return (
    <CreateFields
      kind="template"
      taken={taken}
      scope={scope}
      waiting={state.waiting}
      submit={async (key, name) => create(templateDraft(key, name))}
    />
  )
}

function BlockCreateFields({ scope, taken }: CreateRowProps) {
  const mutation = createBlockAtom(scope)
  const create = useAtomSet(mutation, { mode: "promiseExit" })
  const state = useAtomValue(mutation)
  return (
    <CreateFields
      kind="block"
      taken={taken}
      scope={scope}
      waiting={state.waiting}
      submit={async (key, name) => create(blockDraft(key, name))}
    />
  )
}

const KEY_PROBLEM_MESSAGES: Readonly<Record<KeyProblem, () => string>> = {
  invalid: () => m.templates_settings_key_invalid(),
  reserved: () => m.templates_settings_key_reserved(),
  taken: () => m.templates_error_key_taken()
}

function CreateFields({
  kind,
  scope,
  taken,
  waiting,
  submit
}: Readonly<{
  kind: LibraryKind
  scope: LibraryScope
  taken: ReadonlySet<string>
  waiting: boolean
  submit: (
    key: string,
    name: string
  ) => Promise<Exit.Exit<unknown, Readonly<{ _tag: string }>>>
}>) {
  const { close, busy, setBusy } = useInlineForm<"create">()
  const openEntry = useOpenEntry(scope)
  const [name, setName] = useState("")
  const [typedKey, setTypedKey] = useState<string | null>(null)
  const [didSubmit, setDidSubmit] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const trimmed = name.trim()
  const key = typedKey ?? keyFromName(trimmed)
  const problem = trimmed.length === 0 ? null : keyProblem(key, kind, taken)
  const error =
    problem !== null && (didSubmit || typedKey !== null)
      ? KEY_PROBLEM_MESSAGES[problem]()
      : didSubmit && !waiting
        ? failure
        : null

  const cancel = () => {
    setName("")
    setTypedKey(null)
    close()
  }

  const onSubmit = async () => {
    if (trimmed.length === 0) return cancel()
    setDidSubmit(true)
    if (problem !== null) return
    setBusy(true)
    setFailure(null)
    const exit = await submit(key, trimmed)
    if (Exit.isSuccess(exit)) {
      close()
      openEntry(kind, key)
      return
    }
    setFailure(failureText(AsyncResult.fromExit(exit)))
    setBusy(false)
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) cancel()
      }}
      className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          value={name}
          disabled={busy}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          placeholder={
            kind === "template"
              ? m.templates_settings_new_template_placeholder()
              : m.templates_settings_new_block_placeholder()
          }
          className="h-8 w-64 max-w-full rounded-md"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {m.templates_settings_key_label()}
          <Input
            value={key}
            disabled={busy}
            maxLength={48}
            spellCheck={false}
            onChange={(event) => setTypedKey(event.target.value)}
            className="h-8 w-48 rounded-md font-mono text-xs"
          />
        </label>
        <span className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={cancel}
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
      {error === null ? null : (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
