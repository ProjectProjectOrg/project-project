import { Button } from "@pp/ui/button"
import type { CSSProperties, ReactNode } from "react"

function Labelled({
  label,
  note,
  children
}: Readonly<{ label: string; note: string; children: ReactNode }>) {
  return (
    <figure className="flex flex-col items-center gap-2.5">
      {children}
      <figcaption className="flex flex-col items-center text-center">
        <span className="text-caption font-semibold">{label}</span>
        <span className="text-micro text-muted-foreground tabular-nums">
          {note}
        </span>
      </figcaption>
    </figure>
  )
}

const shapeStyle = (shape: string): CSSProperties =>
  ({ cornerShape: shape, borderRadius: 28 }) as CSSProperties

// The same 28px radius in three corner shapes, outlined so the curve shows.
function Corners() {
  const shapes = [
    ["round", "Round", "the browser's default"],
    ["superellipse(1.5)", "Control", "--button-corner"],
    ["squircle", "Object", "corner-squircle"]
  ] as const
  return (
    <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-4">
      {shapes.map(([shape, label, note]) => (
        <Labelled key={shape} label={label} note={note}>
          <div
            className="size-24 bg-card shadow-[inset_0_0_0_1.5px_var(--foreground)]"
            style={shapeStyle(shape)}
          />
        </Labelled>
      ))}
    </div>
  )
}

// Every control's corner is half its height, so a row of them lines up.
function HalfHeight() {
  const sizes = [
    ["xs", "20px, r 10"],
    ["sm", "28px, r 14"],
    ["md", "32px, r 16"],
    ["lg", "36px, r 18"]
  ] as const
  return (
    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 @xl:grid-cols-[repeat(4,minmax(0,1fr))]">
      {sizes.map(([size, note]) => (
        <Labelled key={size} label={size} note={note}>
          <Button size={size} variant="secondary">
            Button
          </Button>
        </Labelled>
      ))}
    </div>
  )
}

// Inner corners are the outer radius minus the gap, so the edges run
// parallel.
function Concentric() {
  return (
    <div className="grid gap-4 @xl:grid-cols-2">
      <Labelled label="Concentric" note="18 outside, 4 gap, 14 inside">
        <div className="rounded-[18px] bg-card p-1 shadow-[inset_0_0_0_1px_var(--border)] corner-squircle">
          <div className="h-20 w-40 rounded-[14px] bg-muted corner-squircle" />
        </div>
      </Labelled>
      <Labelled label="Not concentric" note="18 outside, 4 gap, 18 inside">
        <div className="rounded-[18px] bg-card p-1 shadow-[inset_0_0_0_1px_var(--border)] corner-squircle">
          <div className="h-20 w-40 rounded-[18px] bg-muted corner-squircle" />
        </div>
      </Labelled>
    </div>
  )
}

export default function ShapeOverview() {
  return (
    <div className="@container flex w-full flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="text-body font-semibold">Corner shapes</h3>
        <Corners />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-body font-semibold">Half the height</h3>
        <HalfHeight />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-body font-semibold">Nested corners</h3>
        <Concentric />
      </section>
    </div>
  )
}
