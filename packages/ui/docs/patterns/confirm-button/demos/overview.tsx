import { ConfirmButton, useConfirmButton } from "@pp/ui/confirm-button"
import * as Effect from "effect/Effect"
import { useEffect, useRef, type FocusEvent, type ReactNode } from "react"

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="flex w-full max-w-24 flex-col items-center gap-3">
      <div className="grid h-8 place-items-center">{children}</div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

// A confirm step shown open: the capsule grows leftward from a trigger at
// the end of a row, so each one gets the row's full width.
function Step({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="flex w-full flex-col items-end gap-3">
      <div className="flex h-8 w-full items-center justify-end">{children}</div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

function StartConfirming() {
  const { open } = useConfirmButton()
  useEffect(() => open(), [open])
  return null
}

// Cancel takes focus because a click normally opens the step. The open
// states below open on mount, so drop focus until the reader first presses
// a key or the pointer, instead of letting a static row pull the page's
// focus.
function useDropFocusUntilInput() {
  const touched = useRef(false)
  useEffect(() => {
    const mark = () => (touched.current = true)
    window.addEventListener("pointerdown", mark, { once: true, capture: true })
    window.addEventListener("keydown", mark, { once: true, capture: true })
    return () => {
      window.removeEventListener("pointerdown", mark, { capture: true })
      window.removeEventListener("keydown", mark, { capture: true })
    }
  }, [])
  return (event: FocusEvent) => {
    if (!touched.current && event.target instanceof HTMLElement)
      event.target.blur()
  }
}

const noError = () => "Couldn't delete it."
const done = () => undefined
const later = () =>
  Effect.runPromise(Effect.sleep("1200 millis").pipe(Effect.as(true)))

// The live specimen: click either trigger. It counts down and closes on its
// own; hover the capsule to hold it.
function Large() {
  return (
    <div className="flex [zoom:2] flex-col items-center gap-3 py-2">
      <div className="flex w-64 justify-end">
        <ConfirmButton.Root>
          <ConfirmButton.DeleteTrigger aria-label="Delete comment" />
          <ConfirmButton.Confirm>
            <ConfirmButton.Action
              prompt="Delete this comment?"
              label="Delete"
              busyLabel="Deleting…"
              cancelLabel="Cancel"
              describeError={noError}
              onConfirm={later}
            />
          </ConfirmButton.Confirm>
        </ConfirmButton.Root>
      </div>
      <div className="flex w-64 justify-end">
        <ConfirmButton.Root>
          <ConfirmButton.Trigger variant="tertiary" size="sm">
            Delete project
          </ConfirmButton.Trigger>
          <ConfirmButton.Confirm>
            <ConfirmButton.Action
              prompt="Delete for everyone?"
              label="Delete project"
              busyLabel="Deleting…"
              cancelLabel="Cancel"
              describeError={noError}
              onConfirm={later}
            />
          </ConfirmButton.Confirm>
        </ConfirmButton.Root>
      </div>
    </div>
  )
}

const TRIGGER_STATES = [
  ["Idle", {}],
  ["Hover", { "data-force": "hover" }],
  ["Pressed", { "data-force": "hover active" }],
  ["Focus", { "data-force": "focus" }],
  ["Disabled", { disabled: true }]
] as const

export default function Overview() {
  const dropEarlyFocus = useDropFocusUntilInput()
  return (
    <div
      className="@container flex w-full flex-col gap-10"
      onFocusCapture={dropEarlyFocus}
    >
      <Large />

      <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] justify-items-center gap-y-6">
        {TRIGGER_STATES.map(([caption, props]) => (
          <Cell key={`icon-${caption}`} caption={caption}>
            <ConfirmButton.Root>
              <ConfirmButton.DeleteTrigger
                aria-label={`Delete comment, ${caption.toLowerCase()}`}
                {...props}
              />
            </ConfirmButton.Root>
          </Cell>
        ))}
        {TRIGGER_STATES.map(([caption, props]) => (
          <Cell key={`text-${caption}`} caption={caption}>
            <ConfirmButton.Root>
              <ConfirmButton.Trigger variant="tertiary" size="sm" {...props}>
                Delete
              </ConfirmButton.Trigger>
            </ConfirmButton.Root>
          </Cell>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-6 @2xl:grid-cols-[repeat(2,minmax(0,1fr))]">
        <Step caption="Confirming">
          <ConfirmButton.Root>
            <StartConfirming />
            <ConfirmButton.DeleteTrigger aria-label="Delete comment" />
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                timeout={false}
                prompt="Delete this comment?"
                label="Delete"
                cancelLabel="Cancel"
                describeError={noError}
                onConfirm={done}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </Step>
        <Step caption="Busy">
          <ConfirmButton.Root>
            <StartConfirming />
            <ConfirmButton.DeleteTrigger aria-label="Delete comment" />
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                prompt="Delete this comment?"
                label="Delete"
                busyLabel="Deleting…"
                waiting
                cancelLabel="Cancel"
                describeError={noError}
                onConfirm={done}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </Step>
        <Step caption="Error (no countdown)">
          <ConfirmButton.Root>
            <StartConfirming />
            <ConfirmButton.DeleteTrigger aria-label="Delete comment" />
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                prompt="Delete this comment?"
                label="Delete"
                error="Couldn't delete the comment."
                cancelLabel="Cancel"
                describeError={noError}
                onConfirm={done}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </Step>
        <Step caption="Neutral tone (no countdown)">
          <ConfirmButton.Root>
            <StartConfirming />
            <ConfirmButton.Trigger variant="ghost" size="sm">
              Skip
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                tone="neutral"
                prompt="Skip these people?"
                label="Skip"
                cancelLabel="Cancel"
                describeError={noError}
                onConfirm={done}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </Step>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-10 gap-y-6 @2xl:grid-cols-[repeat(2,minmax(0,1fr))]">
        <div className="flex flex-col gap-3">
          <ConfirmButton.Root flow className="flex-wrap">
            <StartConfirming />
            <ConfirmButton.Confirm className="flex-wrap">
              <ConfirmButton.Action
                timeout={false}
                prompt="Delete “Bug” from the library? Projects keep their copies."
                label="Delete"
                cancelLabel="Cancel"
                describeError={noError}
                onConfirm={done}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
          <span className="text-caption text-muted-foreground">
            Flow: in place, for long prompts
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <div className="w-72 rounded-xl border border-border/60 bg-card p-3">
            <ConfirmButton.Root flow className="w-full">
              <StartConfirming />
              <ConfirmButton.Confirm className="w-full">
                <ConfirmButton.Action
                  layout="stacked"
                  prompt="Delete this sprint?"
                  description="Membership is removed; tickets remain."
                  label="Delete"
                  cancelLabel="Cancel"
                  describeError={noError}
                  onConfirm={done}
                />
              </ConfirmButton.Confirm>
            </ConfirmButton.Root>
          </div>
          <span className="text-caption text-muted-foreground">
            Stacked: in a popover, from a menu
          </span>
        </div>
        <div className="flex flex-col gap-3 @2xl:col-span-2">
          <ConfirmButton.Root flow>
            <StartConfirming />
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                layout="stacked"
                typed="acme"
                prompt="Type acme to delete this organization"
                label="Delete"
                cancelLabel="Cancel"
                describeError={noError}
                onConfirm={done}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
          <span className="text-caption text-muted-foreground">
            Typed: the name must match before Delete enables
          </span>
        </div>
      </div>
    </div>
  )
}
