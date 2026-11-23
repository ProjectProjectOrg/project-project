import { cn } from "@pp/ui/lib/utils"
import { Switch } from "@pp/ui/switch"
import { useId, useState, type MouseEvent } from "react"

// The whole row toggles its switch, as SettingsRow does in the app.
function toggleRowSwitch(event: MouseEvent<HTMLDivElement>) {
  if (event.target instanceof Element && event.target.closest("[role=switch]"))
    return
  event.currentTarget
    .querySelector<HTMLElement>('[data-slot="switch"]')
    ?.click()
}

// Resolves after roughly `ms`, counted in animation frames.
function waitFrames(ms: number) {
  const end = performance.now() + ms
  return new Promise<void>((resolve) => {
    const tick = (now: number) => {
      if (now >= end) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

function Row({
  label,
  description,
  defaultChecked = false,
  disabled = false,
  failure
}: Readonly<{
  label: string
  description: string
  defaultChecked?: boolean
  disabled?: boolean
  // When set, saving takes a moment and then fails with this message.
  failure?: string
}>) {
  const id = useId()
  const [checked, setChecked] = useState(defaultChecked)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const change = (next: boolean) => {
    setChecked(next)
    if (failure === undefined) return
    // Stands in for a request that takes a moment and then fails: the switch
    // springs back to where it was and the message takes the description's
    // place.
    setFailed(false)
    setLoading(true)
    void waitFrames(1600).then(() => {
      setLoading(false)
      setChecked(!next)
      setFailed(true)
    })
  }
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- a pointer shortcut only: keyboard users reach the switch itself
    <div
      onClick={toggleRowSwitch}
      className="flex min-h-14 items-center gap-x-4 px-4 py-3 transition-colors select-none has-[[data-slot=switch]:not([data-disabled],[data-loading])]:cursor-pointer has-[[data-slot=switch]:not([data-disabled],[data-loading])]:hover:bg-hover"
    >
      <div className="min-w-0 flex-1">
        <p id={`${id}-label`} className="text-body leading-tight font-semibold">
          {label}
        </p>
        {/* Description and error share one grid cell, so the row keeps the
            height of the longer one and nothing below it moves. */}
        <div className="mt-0.5 grid text-caption">
          <p
            id={`${id}-description`}
            className={cn(
              "col-start-1 row-start-1 text-muted-foreground transition-[opacity,translate] duration-150 ease-out",
              failed && "-translate-y-0.5 opacity-0"
            )}
          >
            {description}
          </p>
          {failure !== undefined && (
            <>
              {/* Always laid out, so the cell already has the error's height;
                  only its opacity changes. */}
              <p
                aria-hidden
                className={cn(
                  "col-start-1 row-start-1 text-destructive transition-[opacity,translate] duration-150 ease-out",
                  !failed && "translate-y-0.5 opacity-0"
                )}
              >
                {failure}
              </p>
              <output className="sr-only">{failed ? failure : ""}</output>
            </>
          )}
        </div>
      </div>
      <Switch
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        aria-invalid={failed || undefined}
        checked={checked}
        onCheckedChange={change}
        disabled={disabled}
        loading={loading}
      />
    </div>
  )
}

export default function SettingsRow() {
  return (
    <div className="w-full max-w-md divide-y divide-border overflow-hidden rounded-lg border border-border surface-card">
      <Row
        label="Only move forward"
        description="A branch event never moves a ticket back to an earlier status."
        defaultChecked
      />
      <Row
        label="Post to Slack"
        description="Saving takes a moment, so the switch shows it is busy."
        failure="Couldn't reach Slack, so nothing changed. Try again."
      />
      <Row
        label="Sync reviewers"
        description="Only admins can change this."
        defaultChecked
        disabled
      />
    </div>
  )
}
