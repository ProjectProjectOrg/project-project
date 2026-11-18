import type { ReactNode } from "react"

import { surfaceRuleCss } from "./surface"

// One scene twice, side by side: under today's tokens, and under the
// surface rule (scoped to the right-hand copy).
export function Compare({ scene }: Readonly<{ scene: () => ReactNode }>) {
  return (
    <div className="@container w-full">
      <style>{surfaceRuleCss}</style>
      <div className="grid gap-4 @2xl:grid-cols-[repeat(2,minmax(0,1fr))]">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-caption font-semibold">Before (today)</span>
          {scene()}
        </div>
        <div className="surface-rule flex min-w-0 flex-col gap-2">
          <span className="text-caption font-semibold">After (proposed)</span>
          {scene()}
        </div>
      </div>
    </div>
  )
}

// A control with the state it's pinned in as a caption under it, the way
// the overview demos label their cells.
export function Pinned({
  state,
  className,
  children
}: Readonly<{ state: string; className?: string; children: ReactNode }>) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className ?? ""}`}>
      {children}
      <span className="text-center text-caption text-muted-foreground">
        {state}
      </span>
    </div>
  )
}

// The same caption beside something it can't sit under (a row): outside
// the row, so the row's own hover never sits behind it.
export function SideCaption({ state }: Readonly<{ state: string }>) {
  return (
    <span className="w-16 shrink-0 text-caption text-muted-foreground">
      {state}
    </span>
  )
}
