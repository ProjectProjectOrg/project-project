import { ConfirmButton, useConfirmButton } from "@pp/ui/confirm-button"
import { useEffect, useRef, type FocusEvent, type ReactNode } from "react"

function Row({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-6">
      <span className="text-caption text-muted-foreground">{caption}</span>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </div>
  )
}

function StartConfirming() {
  const { open } = useConfirmButton()
  useEffect(() => open(), [open])
  return null
}

// Cancel autofocuses because a click normally opens the prompt. These rows
// open on mount, so drop focus until the reader first presses a key or the
// pointer, instead of letting a static state row pull the page's focus.
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

export default function Overview() {
  const dropEarlyFocus = useDropFocusUntilInput()
  return (
    <div
      className="grid w-full max-w-2xl gap-6"
      onFocusCapture={dropEarlyFocus}
    >
      <Row caption="Delete trigger">
        <ConfirmButton.Root>
          <ConfirmButton.DeleteTrigger aria-label="Delete comment" />
        </ConfirmButton.Root>
        <ConfirmButton.Root>
          <ConfirmButton.DeleteTrigger
            aria-label="Delete comment, hovered"
            data-force="hover"
          />
        </ConfirmButton.Root>
        <ConfirmButton.Root>
          <ConfirmButton.DeleteTrigger
            aria-label="Delete comment, pressed"
            data-force="hover active"
          />
        </ConfirmButton.Root>
        <ConfirmButton.Root>
          <ConfirmButton.DeleteTrigger
            aria-label="Delete comment, focused"
            data-force="focus"
          />
        </ConfirmButton.Root>
        <ConfirmButton.Root>
          <ConfirmButton.DeleteTrigger
            aria-label="Delete comment, disabled"
            disabled
          />
        </ConfirmButton.Root>
      </Row>
      <Row caption="Text trigger">
        <ConfirmButton.Root>
          <ConfirmButton.Trigger variant="tertiary" size="sm">
            Delete project
          </ConfirmButton.Trigger>
        </ConfirmButton.Root>
        <ConfirmButton.Root>
          <ConfirmButton.Trigger variant="tertiary" size="sm" disabled>
            Delete project
          </ConfirmButton.Trigger>
        </ConfirmButton.Root>
      </Row>
      <Row caption="Confirming, sm">
        <ConfirmButton.Root>
          <StartConfirming />
          <ConfirmButton.DeleteTrigger aria-label="Delete comment" />
          <ConfirmButton.Confirm>
            <ConfirmButton.Action
              prompt="Delete this comment?"
              label="Delete"
              cancelLabel="Cancel"
              describeError={noError}
              onConfirm={done}
            />
          </ConfirmButton.Confirm>
        </ConfirmButton.Root>
      </Row>
      <Row caption="Confirming, xs">
        <ConfirmButton.Root className="w-72">
          <StartConfirming />
          <ConfirmButton.Confirm className="w-full">
            <ConfirmButton.Action
              size="xs"
              prompt="Remove this attachment?"
              label="Remove"
              cancelLabel="Cancel"
              describeError={noError}
              onConfirm={done}
            />
          </ConfirmButton.Confirm>
        </ConfirmButton.Root>
      </Row>
      <Row caption="Busy">
        <ConfirmButton.Root>
          <StartConfirming />
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
      </Row>
      <Row caption="Error">
        <ConfirmButton.Root>
          <StartConfirming />
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
      </Row>
      <Row caption="Neutral tone">
        <ConfirmButton.Root>
          <StartConfirming />
          <ConfirmButton.Confirm>
            <ConfirmButton.Action
              tone="neutral"
              prompt="Leave this sprint?"
              label="Leave"
              cancelLabel="Cancel"
              describeError={noError}
              onConfirm={done}
            />
          </ConfirmButton.Confirm>
        </ConfirmButton.Root>
      </Row>
      <Row caption="Stacked">
        <div className="w-72 rounded-xl bg-popover p-3 shadow-surface-3">
          <ConfirmButton.Root className="w-full">
            <StartConfirming />
            <ConfirmButton.Confirm className="w-full">
              <ConfirmButton.Action
                layout="stacked"
                prompt="Disconnect acme/web?"
                description="Branches and pull requests stop syncing."
                label="Disconnect"
                cancelLabel="Cancel"
                describeError={noError}
                onConfirm={done}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </div>
      </Row>
      <Row caption="Typed">
        <ConfirmButton.Root>
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
      </Row>
    </div>
  )
}
