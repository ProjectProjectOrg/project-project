import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { Library } from "@pp/shared"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"
import { useContext, useId, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  SegmentedTabs,
  type SegmentedItem
} from "@/components/ui/segmented-tabs"
import {
  createBlockAtom,
  createTypeAtom,
  orgScope,
  type LibraryLayer,
  type LibraryScope
} from "@/features/library/atoms/libraryScope"
import {
  ExamplePicker,
  useExamples
} from "@/features/library/components/ExamplePicker"
import {
  LibraryListLink,
  useOpenEntry
} from "@/features/library/components/LibraryEntryLink"
import { useScopeProjectName } from "@/features/library/hooks/useLibraryPermissions"
import type { LibraryKind } from "@/features/library/lib/libraryModel"
import {
  exampleSections,
  exampleTypes,
  newSectionDraft,
  newTypeDraft,
  sectionsNeededBy,
  takenKeys
} from "@/features/library/lib/newEntry"
import { useAppForm, useFormValues } from "@/lib/form"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import {
  effectiveLibraryKey,
  libraryCreateFormOpts,
  type LibraryCreateValues
} from "./opts"

export type LibraryCreateProps = Readonly<{
  kind: LibraryKind
  scope: LibraryScope
  library: Library
  orgLibrary: Library | null
  layers: ReadonlyArray<LibraryLayer>
  orgName: string
  compact?: boolean
  onCreated?: (key: string) => void
  onCancel?: () => void
}>

export function LibraryCreateForm({
  kind,
  scope,
  library,
  orgLibrary,
  layers,
  orgName,
  compact = false,
  onCreated,
  onCancel
}: LibraryCreateProps) {
  const registry = useContext(RegistryContext)
  const openEntry = useOpenEntry()
  const projectName = useScopeProjectName(scope)
  const nameId = useId()
  const keyId = useId()
  const [failure, setFailure] = useState<string | null>(null)
  const initialLayer = layers[0] ?? scope.layer
  const targetOf = (layer: LibraryLayer): LibraryScope =>
    layer === scope.layer ? scope : orgScope(scope.req.params.orgSlug)
  const libraryOf = (layer: LibraryLayer): Library =>
    layer === "org" && scope.layer === "project"
      ? (orgLibrary ?? library)
      : library
  const takenIn = (layer: LibraryLayer) =>
    takenKeys(
      layer === scope.layer ? [library] : [library, libraryOf(layer)],
      kind
    )

  const form = useAppForm({
    ...libraryCreateFormOpts(kind, initialLayer, takenIn),
    onSubmit: async ({ value }) => {
      setFailure(null)
      const target = targetOf(value.layer)
      const failed = await createEntry(registry, {
        kind,
        target,
        library: libraryOf(value.layer),
        value
      })
      if (failed !== null) return setFailure(failed)
      const key = effectiveLibraryKey(value)
      if (onCreated === undefined) openEntry(target, kind, key)
      else onCreated(key)
    }
  })
  const values = useFormValues(form)
  const target = targetOf(values.layer)
  const typeWaiting = useAtomValue(createTypeAtom(target)).waiting
  const blockWaiting = useAtomValue(createBlockAtom(target)).waiting
  const busy = typeWaiting || blockWaiting
  const targetLibrary = libraryOf(values.layer)
  const examples = useExamples(kind, targetLibrary)
  const chosen = examples.find((example) => example.key === values.example)

  const pick = (key: string | null) => {
    const previous = examples.find((example) => example.key === values.example)
    const next = examples.find((example) => example.key === key)
    form.setFieldValue("example", key)
    if (values.name.trim() === "" || values.name === previous?.name)
      form.setFieldValue("name", next?.name ?? "")
  }

  const layerItems: ReadonlyArray<SegmentedItem<LibraryLayer>> = layers.map(
    (layer) => ({
      key: layer,
      label:
        layer === "project"
          ? m.templates_new_for_project({ project: projectName })
          : m.templates_new_for_org({ org: orgName })
    })
  )

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy) void form.handleSubmit()
      }}
      className={cn("flex flex-col", compact ? "gap-4" : "max-w-2xl gap-6")}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="px-0.5 text-body font-semibold">
          {m.templates_new_name()}
        </label>
        <form.Field name="name">
          {(field) => (
            <Input
              id={nameId}
              value={field.value}
              disabled={busy}
              maxLength={60}
              aria-invalid={field.errors.length > 0}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="key">
          {(field) => (
            <span className="flex items-center gap-1 px-0.5 text-caption text-muted-foreground">
              <label htmlFor={keyId}>{m.templates_settings_key_label()}</label>
              <Input
                id={keyId}
                variant="inline-muted"
                value={effectiveLibraryKey(values)}
                disabled={busy}
                maxLength={48}
                spellCheck={false}
                aria-invalid={field.errors.length > 0}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                className="w-56 max-w-full font-mono"
              />
            </span>
          )}
        </form.Field>
        <form.Field name="key">
          {(keyField) => (
            <form.Field name="name">
              {(nameField) => {
                const message =
                  nameField.errors[0]?.message ?? keyField.errors[0]?.message
                return message === undefined ? null : (
                  <p
                    role="alert"
                    className="px-0.5 text-caption text-destructive"
                  >
                    {message}
                  </p>
                )
              }}
            </form.Field>
          )}
        </form.Field>
      </div>
      {layerItems.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <span className="px-0.5 text-body font-semibold">
            {m.templates_new_for()}
          </span>
          <form.Field name="layer">
            {(field) => (
              <SegmentedTabs
                className="self-start"
                items={layerItems}
                value={field.value}
                onValueChange={field.handleChange}
              />
            )}
          </form.Field>
        </div>
      ) : null}
      {compact ? null : (
        <ExamplePicker
          kind={kind}
          examples={examples}
          value={values.example}
          disabled={busy}
          onPick={pick}
        />
      )}
      {kind === "type" && chosen !== undefined ? (
        <p className="px-0.5 text-caption text-muted-foreground">
          {m.templates_new_example_note()}
        </p>
      ) : null}
      {failure === null ? null : (
        <p role="alert" className="px-0.5 text-caption text-destructive">
          {failure}
        </p>
      )}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          compact && "justify-end"
        )}
      >
        {onCancel === undefined ? null : (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {m.templates_settings_cancel()}
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={busy}
          className={cn(busy && "animate-pulse")}
        >
          {submitLabel(kind, onCreated !== undefined)}
        </Button>
        {onCancel === undefined ? (
          <Button
            variant="ghost"
            render={<LibraryListLink scope={scope} kind={kind} />}
          >
            {m.templates_settings_cancel()}
          </Button>
        ) : null}
      </div>
    </form>
  )
}

const submitLabel = (kind: LibraryKind, adds: boolean): string => {
  if (adds) return m.templates_new_create_and_add()
  return kind === "type"
    ? m.templates_new_create_type()
    : m.templates_new_create_section()
}

type CreateRequest = Readonly<{
  kind: LibraryKind
  target: LibraryScope
  library: Library
  value: LibraryCreateValues
}>

const createEntry = async (
  registry: AtomRegistry,
  { kind, target, library, value }: CreateRequest
): Promise<string | null> => {
  const key = effectiveLibraryKey(value)
  const name = value.name.trim()
  if (kind === "section") {
    const example =
      exampleSections(library).find((draft) => draft.key === value.example) ??
      null
    return mutationErrorText(
      await fireMutation(
        registry,
        createBlockAtom(target),
        newSectionDraft(example, { key, name, icon: null })
      )
    )
  }
  const example =
    exampleTypes(library).find((draft) => draft.key === value.example) ?? null
  const draft = newTypeDraft(example, { key, name, icon: null })
  for (const section of sectionsNeededBy(library, draft)) {
    const failed = mutationErrorText(
      await fireMutation(registry, createBlockAtom(target), section)
    )
    if (failed !== null) return failed
  }
  return mutationErrorText(
    await fireMutation(registry, createTypeAtom(target), draft)
  )
}
