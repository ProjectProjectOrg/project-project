import {
  Chip,
  ChipDots,
  type ChipInteraction,
  type ChipKind
} from "@pp/ui/chip"
import { Gauge } from "@pp/ui/icons"
import type { ReactNode } from "react"

const TAG_COLORS = ["#60a5fa", "#f87171", "#a78bfa", "#4ade80"]

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-3">
      <div className="grid h-7 max-w-full place-items-center">{children}</div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

function Estimate({
  force,
  interaction = "press"
}: Readonly<{ force?: string; interaction?: ChipInteraction }>) {
  return (
    <Chip
      interaction={interaction}
      data-force={force}
      aria-label="3 points"
      className="tabular-nums"
    >
      <Gauge className="size-3" strokeWidth={1.75} />3
    </Chip>
  )
}

function Tag({
  force,
  kind = "label"
}: Readonly<{ force?: string; kind?: ChipKind }>) {
  return (
    <Chip kind={kind} interaction="press" data-force={force}>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: TAG_COLORS[0] }}
      />
      sync
    </Chip>
  )
}

// One of each kind, side by side, live: hover and press them.
function Large() {
  return (
    <div className="flex [zoom:3] flex-nowrap items-center justify-center gap-4 py-2">
      <Estimate />
      <Tag />
    </div>
  )
}

export default function Overview() {
  return (
    <div className="@container flex w-full flex-col gap-8">
      <Large />
      <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] justify-items-center gap-x-2 gap-y-6">
        <Cell caption="Data">
          <Estimate />
        </Cell>
        <Cell caption="Hover">
          <Estimate force="hover" />
        </Cell>
        <Cell caption="Pressed">
          <Estimate force="hover active" />
        </Cell>
        <Cell caption="Focus">
          <Estimate force="focus" />
        </Cell>
        <Cell caption="Static">
          <Chip className="tabular-nums">
            <Gauge aria-hidden className="size-3" strokeWidth={1.75} />3
          </Chip>
        </Cell>

        <Cell caption="Label">
          <Tag />
        </Cell>
        <Cell caption="Hover">
          <Tag force="hover" />
        </Cell>
        <Cell caption="Pressed">
          <Tag force="hover active" />
        </Cell>
        <Cell caption="Focus">
          <Tag force="focus" />
        </Cell>
        <Cell caption="Folded">
          <Chip kind="label" interaction="press" aria-label="4 tags">
            <ChipDots colors={TAG_COLORS} />4
          </Chip>
        </Cell>
      </div>
    </div>
  )
}
