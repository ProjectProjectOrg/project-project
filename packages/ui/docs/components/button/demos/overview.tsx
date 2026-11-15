import { Button } from "@pp/ui/button"
import {
  Calendar,
  CircleDot,
  Filter,
  MoreHorizontal,
  Plus,
  Trash2,
  User,
  X
} from "@pp/ui/icons"
import type { ReactNode } from "react"

function Row({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-6">
      <span className="text-caption text-muted-foreground">{caption}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

const STATE_VARIANTS = [
  "primary",
  "secondary",
  "tertiary",
  "destructive",
  "ghost"
] as const

export default function Overview() {
  return (
    <div className="grid w-full max-w-3xl gap-6">
      <Row caption="Variants">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="tertiary">Tertiary</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="ghost">Ghost</Button>
        <Button
          variant="dither"
          className="w-40 justify-start text-primary-foreground"
          leadingIcon={Plus}
          ditherFrom="var(--primary)"
          ditherTo="var(--background)"
          ditherStops={[0.7, 1]}
          ditherHoverStops={[0.5, 1]}
        >
          Dither
        </Button>
      </Row>
      <Row caption="Sizes">
        <Button size="xs">Extra small</Button>
        <Button size="compact">Compact</Button>
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </Row>
      <Row caption="With icons">
        <Button leadingIcon={Plus}>Create ticket</Button>
        <Button variant="secondary" leadingIcon={User}>
          Assign
        </Button>
        <Button variant="destructive" leadingIcon={Trash2}>
          Delete
        </Button>
        <Button variant="ghost" trailingIcon={X}>
          Clear filters
        </Button>
        <Button variant="ghost" tone="strong" leadingIcon={Calendar}>
          Due date
        </Button>
      </Row>
      <Row caption="Icon sizes">
        <Button variant="ghost" size="icon-xs" aria-label="Filter, extra small">
          <Filter />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Filter, small">
          <Filter />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Filter">
          <Filter />
        </Button>
        <Button variant="ghost" size="icon-lg" aria-label="Filter, large">
          <Filter />
        </Button>
        <Button variant="secondary" size="icon" aria-label="Add">
          <Plus />
        </Button>
        <Button variant="primary" size="icon" aria-label="Add, primary">
          <Plus />
        </Button>
        <Button variant="ghost" tone="strong" size="icon-sm" aria-label="More">
          <MoreHorizontal />
        </Button>
      </Row>
      {STATE_VARIANTS.map((variant) => (
        <Row key={variant} caption={`States, ${variant}`}>
          <Button variant={variant}>Default</Button>
          <Button variant={variant} data-force="hover">
            Hover
          </Button>
          <Button variant={variant} data-force="hover active">
            Pressed
          </Button>
          <Button variant={variant} data-force="focus">
            Focus
          </Button>
          <Button variant={variant} disabled>
            Disabled
          </Button>
          <Button variant={variant} loading aria-label="Saving">
            Loading
          </Button>
        </Row>
      ))}
      <Row caption="Ghost, strong and pressed">
        <Button variant="ghost" tone="strong" leadingIcon={CircleDot}>
          Ghost, strong
        </Button>
        <Button variant="ghost" size="sm" aria-pressed>
          Ghost, pressed
        </Button>
      </Row>
      <Row caption="Toolbar and overlay">
        <Button variant="toolbar" size="sm" aria-pressed>
          Toolbar
        </Button>
        <Button variant="overlay" size="sm">
          Overlay
        </Button>
        <Button variant="overlay" tone="destructive" size="sm">
          Overlay, destructive
        </Button>
      </Row>
    </div>
  )
}
