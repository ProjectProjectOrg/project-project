import { avatarEdgeClass } from "@pp/ui/avatar"
import { Badge } from "@pp/ui/badge"
import { Button } from "@pp/ui/button"
import { popupSurfaceClass } from "@pp/ui/menu-styles"
import type { ReactNode } from "react"

function Cell({
  label,
  note,
  children
}: Readonly<{ label: string; note: string; children: ReactNode }>) {
  return (
    <figure className="flex flex-col items-center gap-3">
      <div className="flex h-28 w-full items-center justify-center rounded-[18px] bg-page corner-squircle">
        {children}
      </div>
      <figcaption className="flex flex-col items-center text-center">
        <span className="text-caption font-semibold">{label}</span>
        <span className="text-micro text-muted-foreground">{note}</span>
      </figcaption>
    </figure>
  )
}

const tile = "size-16 rounded-[18px] corner-squircle"

// The ways a surface separates from what's under it, from none to the
// most a resting surface ever gets.
function Edges() {
  return (
    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 @2xl:grid-cols-[repeat(4,minmax(0,1fr))]">
      <Cell label="Tone" note="A step of lightness">
        <div className={`${tile} bg-card`} />
      </Cell>
      <Cell label="Hairline" note="--shadow-1, a ring, no lift">
        <div className={`${tile} bg-card shadow-(--shadow-1)`} />
      </Cell>
      <Cell label="Lit edge" note="Avatars, tiles, attachments">
        <div className={`${tile} relative bg-card ${avatarEdgeClass}`} />
      </Cell>
      <Cell label="Popup" note="Card and a 60% hairline">
        <div
          className={`${popupSurfaceClass} flex h-16 w-24 items-center justify-center text-caption text-muted-foreground`}
        >
          Menu
        </div>
      </Cell>
    </div>
  )
}

// The ladder: each step a little further from the page, in both themes.
function Ladder() {
  const steps = [1, 2, 3, 4, 5, 6, 7, 8] as const
  return (
    <div className="flex flex-col gap-2 rounded-[18px] bg-page p-3 corner-squircle">
      <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2 @xl:grid-cols-[repeat(8,minmax(0,1fr))]">
        {steps.map((step) => (
          <div
            key={step}
            className="flex h-14 items-end rounded-[12px] p-2 corner-squircle"
            style={{
              background: `var(--surface-${step})`,
              boxShadow: `var(--shadow-surface-${step})`
            }}
          >
            <span className="text-micro text-foreground tabular-nums">
              {step}
            </span>
          </div>
        ))}
      </div>
      <p className="text-micro text-muted-foreground">
        1 is a recessed well; 3 a raised card; higher steps lift further.
      </p>
    </div>
  )
}

// Filled controls carry a faint sheen made from their own colour.
function Sheen() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 rounded-[18px] bg-page p-6 corner-squircle">
      <Button>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Delete</Button>
      <Badge>Tag</Badge>
      <Badge tone="blue">In review</Badge>
    </div>
  )
}

export default function SurfacesOverview() {
  return (
    <div className="@container flex w-full flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h3 className="text-body font-semibold">Edges</h3>
        <Edges />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-body font-semibold">The surface ladder</h3>
        <Ladder />
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-body font-semibold">Sheen</h3>
        <Sheen />
      </section>
    </div>
  )
}
