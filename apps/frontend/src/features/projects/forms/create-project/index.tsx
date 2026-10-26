import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Atom from "effect/reactivity/Atom"
import { Plus } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRef, useState } from "react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import {
  createProject,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut"
import { errorMessage } from "@/lib/errorMessage"
import { useAppForm, useFormValues } from "@/lib/form"
import { mutationErrorText } from "@/lib/mutationError"
import { slugify } from "@/lib/slug"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

import {
  createProjectFormOpts,
  effectiveProjectKey,
  toCreateProjectInput
} from "./opts"

const sanitizeKey = (value: string) =>
  value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10)

export function CreateProjectRow({
  orgSlug,
  canCreate,
  onFocusChange
}: Readonly<{
  orgSlug: string
  canCreate: boolean
  onFocusChange?: (focused: boolean) => void
}>) {
  const req = projectsRequest(orgSlug)
  const create = useAtomSet(createProject(req), { mode: "promiseExit" })
  const resetCreate = useAtomSet(createProject(req))
  const createState = useAtomValue(createProject(req))
  const submitting = createState.waiting
  const serverError = mutationErrorText(
    createState,
    errorMessage,
    m.projects_create_error_fallback
  )
  const [focused, setFocused] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const reduceMotion = useReducedMotion()
  useGlobalShortcut("c", inputRef)

  const trackFocus = (next: boolean) => {
    setFocused(next)
    onFocusChange?.(next)
  }

  const form = useAppForm({
    ...createProjectFormOpts,
    onSubmit: async ({ value }) => {
      const exit = await create(toCreateProjectInput(value))
      if (Exit.isFailure(exit)) {
        if (!formRef.current?.contains(document.activeElement))
          inputRef.current?.focus()
        return
      }
      const activeElement = document.activeElement
      if (
        activeElement instanceof HTMLElement &&
        formRef.current?.contains(activeElement)
      )
        activeElement.blur()
      form.reset()
      trackFocus(false)
    }
  })
  const values = useFormValues(form)
  const trimmed = values.name.trim()
  const key = effectiveProjectKey(values)

  if (!canCreate) return null

  return (
    <form
      ref={formRef}
      onSubmit={(event) => {
        event.preventDefault()
        if (trimmed && !submitting) void form.handleSubmit()
      }}
    >
      <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
        {m.projects_create_name_aria_label()}
      </button>
      <form.Field name="key">
        {(keyField) => {
          const error =
            keyField.errors.length > 0
              ? m.projects_create_key_invalid()
              : serverError
          return (
            <>
              <InputGroup>
                <InputGroupAddon>
                  <Plus className="size-4" strokeWidth={1.75} />
                </InputGroupAddon>
                <form.Field name="name">
                  {(nameField) => (
                    <InputGroupInput
                      ref={inputRef}
                      value={nameField.value}
                      onChange={(event) => {
                        resetCreate(Atom.Reset)
                        nameField.handleChange(event.target.value)
                        if (!event.target.value.trim())
                          keyField.handleChange(null)
                      }}
                      onFocus={() => trackFocus(true)}
                      onBlur={() => {
                        trackFocus(false)
                        nameField.handleBlur()
                      }}
                      placeholder={m.projects_create_name_placeholder()}
                      aria-label={m.projects_create_name_aria_label()}
                      aria-keyshortcuts="c"
                      readOnly={submitting}
                      aria-disabled={submitting}
                      maxLength={120}
                      className="read-only:cursor-wait"
                    />
                  )}
                </form.Field>
                <AnimatePresence initial={false}>
                  {trimmed && (
                    <motion.div
                      key="key-cluster"
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={reduceMotion ? undefined : { opacity: 0 }}
                      transition={transitions.fade}
                      className="flex shrink-0 items-center"
                    >
                      <div className="mx-1 h-5 w-px bg-border" />
                      <input
                        value={key}
                        onChange={(event) => {
                          resetCreate(Atom.Reset)
                          keyField.handleChange(sanitizeKey(event.target.value))
                        }}
                        onFocus={() => trackFocus(true)}
                        onBlur={() => {
                          trackFocus(false)
                          keyField.handleBlur()
                        }}
                        placeholder={m.projects_create_key_placeholder()}
                        aria-label={m.projects_create_key_aria_label()}
                        aria-invalid={keyField.errors.length > 0}
                        readOnly={submitting}
                        aria-disabled={submitting}
                        maxLength={10}
                        style={{ width: "calc(4ch + 0.5rem)" }}
                        className="shrink-0 bg-transparent pr-2 font-mono text-sm text-foreground uppercase tabular-nums outline-none placeholder:text-muted-foreground read-only:cursor-wait"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                {!focused && !trimmed && !error && <Kbd aria-hidden>c</Kbd>}
              </InputGroup>
              <AnimatePresence initial={false}>
                {trimmed && (
                  <motion.div
                    key="hint"
                    initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
                    transition={transitions.presence}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 flex items-center gap-3 pl-3">
                      <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-muted-foreground">
                        <span className="text-muted-foreground/60">→</span>
                        {key && (
                          <>
                            <span>{key}-1</span>
                            <span className="text-muted-foreground/60">·</span>
                          </>
                        )}
                        <span className="truncate">/{slugify(trimmed)}</span>
                      </div>
                      {error && (
                        <span
                          role="alert"
                          className="ml-auto shrink-0 text-xs text-destructive"
                        >
                          {error}
                        </span>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )
        }}
      </form.Field>
    </form>
  )
}
