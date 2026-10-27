import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { CreatableProjectKey } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"
import { Plus } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRef, useState, type FormEvent } from "react"

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
import { deriveKey } from "@/features/projects/lib/deriveKey"
import { useGlobalShortcut } from "@/hooks/useGlobalShortcut"
import { errorMessage } from "@/lib/errorMessage"
import { slugify } from "@/lib/slug"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

const decodeCreatableProjectKeySync = Schema.decodeSync(CreatableProjectKey)

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
  const create = useAtomSet(createProject(req), {
    mode: "promiseExit"
  })
  const resetCreate = useAtomSet(createProject(req))
  const createState = useAtomValue(createProject(req))
  const submitting = createState.waiting
  const error = Result.matchWithError(createState, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: (err) => errorMessage(err),
    onDefect: () => m.projects_create_error_fallback()
  })
  const [name, setName] = useState("")
  const [keyOverride, setKeyOverride] = useState("")
  const [keyTouched, setKeyTouched] = useState(false)
  const [focused, setFocused] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const reduceMotion = useReducedMotion()
  useGlobalShortcut("c", inputRef)
  const trimmed = name.trim()
  const previewSlug = trimmed ? slugify(trimmed) : ""
  const derivedKey = deriveKey(trimmed)
  const effectiveKey = keyTouched ? keyOverride : derivedKey
  const canSubmit = Boolean(
    trimmed && /^[A-Z][A-Z0-9]{1,9}$/.test(effectiveKey)
  )

  function trackFocus(next: boolean) {
    setFocused(next)
    onFocusChange?.(next)
  }

  function handleKeyChange(value: string) {
    resetCreate(Atom.Reset)
    const sanitized = value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 10)
    setKeyOverride(sanitized)
    setKeyTouched(true)
  }

  function handleNameChange(value: string) {
    resetCreate(Atom.Reset)
    setName(value)
    if (!value.trim()) {
      setKeyOverride("")
      setKeyTouched(false)
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit || submitting) return
    const exit = await create({
      name: trimmed,
      key: decodeCreatableProjectKeySync(effectiveKey)
    })
    if (Exit.isSuccess(exit)) {
      const activeElement = document.activeElement
      if (
        activeElement instanceof HTMLElement &&
        formRef.current?.contains(activeElement)
      ) {
        activeElement.blur()
      }
      setName("")
      setKeyOverride("")
      setKeyTouched(false)
      trackFocus(false)
    } else {
      if (!formRef.current?.contains(document.activeElement)) {
        inputRef.current?.focus()
      }
    }
  }

  if (!canCreate) return null

  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
        {m.projects_create_name_aria_label()}
      </button>
      <InputGroup>
        <InputGroupAddon>
          <Plus className="size-4" strokeWidth={1.75} />
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          onFocus={() => trackFocus(true)}
          onBlur={() => trackFocus(false)}
          placeholder={m.projects_create_name_placeholder()}
          aria-label={m.projects_create_name_aria_label()}
          aria-keyshortcuts="c"
          readOnly={submitting}
          aria-disabled={submitting}
          maxLength={120}
          className="read-only:cursor-wait"
        />
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
                value={effectiveKey}
                onChange={(e) => handleKeyChange(e.target.value)}
                onFocus={() => trackFocus(true)}
                onBlur={() => trackFocus(false)}
                placeholder={m.projects_create_key_placeholder()}
                aria-label={m.projects_create_key_aria_label()}
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
                {effectiveKey && (
                  <>
                    <span>{effectiveKey}-1</span>
                    <span className="text-muted-foreground/60">·</span>
                  </>
                )}
                <span className="truncate">/{previewSlug}</span>
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
    </form>
  )
}
