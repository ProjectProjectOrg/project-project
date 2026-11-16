import { Button } from "@pp/ui/button"
import { spring, transitions } from "@pp/ui/lib/springs"
import { motion } from "motion/react"
import { useState, type ReactNode } from "react"

// A dot crossing a track, once per press, on one timing.
function Track({
  label,
  note,
  at,
  transition
}: Readonly<{
  label: string
  note: string
  at: boolean
  transition: object
}>) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-4">
      <div className="flex flex-col">
        <span className="text-caption font-semibold">{label}</span>
        <span className="font-mono text-micro text-muted-foreground">
          {note}
        </span>
      </div>
      <div className="h-8 rounded-[16px] bg-muted p-1 corner-squircle">
        {/* Percentages on both ends, so the timing can interpolate them. */}
        <div className="relative h-full">
          <motion.span
            aria-hidden
            className="absolute top-0 block size-6 rounded-full bg-foreground"
            initial={false}
            animate={{ left: at ? "100%" : "0%", x: at ? "-100%" : "0%" }}
            transition={transition}
          />
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  action,
  children
}: Readonly<{ title: string; action?: ReactNode; children: ReactNode }>) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-body font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

// Hover lands at once and fades out; press scales the control to 97%.
function Feel() {
  return (
    <div className="grid gap-4 @xl:grid-cols-2">
      <div className="flex flex-col gap-1 rounded-[18px] bg-card p-2 corner-squircle">
        {["Instant on the way in", "Eases out on the way out", "Try both"].map(
          (text) => (
            <button
              key={text}
              type="button"
              className="focus-ring h-8 rounded-[16px] px-3 text-left text-body transition-colors duration-150 ease-out [corner-shape:var(--button-corner)] hover:bg-hover"
            >
              {text}
            </button>
          )
        )}
      </div>
      <div className="flex flex-col items-center justify-center gap-3 rounded-[18px] bg-card p-4 corner-squircle">
        <Button size="lg">Press and hold</Button>
        <span className="text-caption text-muted-foreground">
          97%, over 100–150ms
        </span>
      </div>
    </div>
  )
}

export default function MotionOverview() {
  const [at, setAt] = useState(false)
  const replay = (
    <Button size="sm" variant="secondary" onClick={() => setAt((v) => !v)}>
      Play
    </Button>
  )
  return (
    <div className="@container flex w-full flex-col gap-8">
      <Section title="Springs" action={replay}>
        <div className="flex flex-col gap-2">
          <Track
            label="Fast"
            note="80ms, no bounce"
            at={at}
            transition={spring.fast}
          />
          <Track
            label="Moderate"
            note="160ms, no bounce"
            at={at}
            transition={spring.moderate}
          />
          <Track
            label="Slow"
            note="240ms, a little bounce"
            at={at}
            transition={spring.slow}
          />
        </div>
      </Section>
      <Section title="Transitions">
        <div className="flex flex-col gap-2">
          <Track
            label="Fade"
            note="150ms"
            at={at}
            transition={transitions.fade}
          />
          <Track
            label="Presence"
            note="180ms"
            at={at}
            transition={transitions.presence}
          />
          <Track
            label="Layout"
            note="220ms"
            at={at}
            transition={transitions.layout}
          />
          <Track
            label="Morph"
            note="260ms"
            at={at}
            transition={transitions.morph}
          />
        </div>
      </Section>
      <Section title="Feel">
        <Feel />
      </Section>
    </div>
  )
}
