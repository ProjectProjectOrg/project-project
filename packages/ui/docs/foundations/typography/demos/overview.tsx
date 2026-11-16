import { useRef } from "react"

import { useTokenReading } from "../../tokens"

const ROLES = [
  ["display", "text-display", "Saved trips open instantly", "Page titles"],
  [
    "title",
    "text-title",
    "Acceptance criteria",
    "Section headings, a panel's title"
  ],
  [
    "subtitle",
    "text-subtitle",
    "Steps to reproduce",
    "Sub-sections, a card's title"
  ],
  [
    "body",
    "text-body",
    "After a session expires, signing in again should bring you back to the page you were on.",
    "Running text, rows, controls"
  ],
  [
    "caption",
    "text-caption",
    "Updated 2 hours ago by Maya",
    "Meta, hints, chips"
  ],
  ["micro", "text-micro", "3 of 5 done", "Counts, keys, the smallest labels"]
] as const

// One role per row: the sample at its real size, and the size and line
// height read from the theme.
function Scale() {
  const scope = useRef<HTMLDivElement>(null)
  const sizes = useTokenReading(scope, (el) =>
    ROLES.map(([role]) => {
      const style = getComputedStyle(el)
      const value = (name: string) => style.getPropertyValue(name).trim()
      return {
        size: value(`--fs-${role}`),
        line: value(`--lh-${role}`),
        compact: value(`--fs-${role}-compact`)
      }
    })
  )
  return (
    <div ref={scope} className="flex flex-col">
      {ROLES.map(([role, className, sample, use], index) => (
        <div
          key={role}
          className="grid gap-x-6 gap-y-1 border-t border-border py-3 first:border-t-0 @2xl:grid-cols-[9rem_minmax(0,1fr)]"
        >
          <div className="flex flex-col">
            <span className="text-caption font-semibold">{role}</span>
            <span className="font-mono text-micro text-muted-foreground tabular-nums">
              {sizes?.[index] === undefined
                ? "…"
                : `${sizes[index].size} / ${sizes[index].line} · compact ${sizes[index].compact}`}
            </span>
            <span className="text-micro text-muted-foreground">{use}</span>
          </div>
          <p
            className={`${className} min-w-0 ${role === "display" || role === "title" || role === "subtitle" ? "font-semibold" : ""}`}
          >
            {sample}
          </p>
        </div>
      ))}
    </div>
  )
}

const WEIGHTS = [
  [400, "Regular", "Running text"],
  [550, "Semibold", "Headings, names, the selected row"],
  [700, "Bold", "Emphasis inside text"]
] as const

function Faces() {
  return (
    <div className="grid gap-4 @2xl:grid-cols-2">
      <div className="flex flex-col gap-2 rounded-[18px] bg-card p-4 corner-squircle">
        <span className="text-caption text-muted-foreground">
          Allo, roundness 0: everything
        </span>
        {WEIGHTS.map(([weight, name, use]) => (
          <p key={weight} className="flex items-baseline gap-3">
            <span className="text-title" style={{ fontWeight: weight }}>
              {name} {weight}
            </span>
            <span className="text-caption text-muted-foreground">{use}</span>
          </p>
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-[18px] bg-card p-4 corner-squircle">
        <span className="text-caption text-muted-foreground">
          Geist Mono: literals
        </span>
        <p className="font-mono text-body">fix/ATL-5-saved-trips</p>
        <p className="font-mono text-body">
          safeNext(url.searchParams.get("next"))
        </p>
        <p className="font-mono text-body text-muted-foreground">
          ATL-12 · 3f9c2e1 · atlas-mobile-app
        </p>
      </div>
    </div>
  )
}

// The type the app uses: one sans for everything, mono for literals, on a
// tight scale.
export default function TypographyOverview() {
  return (
    <div className="@container flex w-full flex-col gap-8">
      <Scale />
      <Faces />
    </div>
  )
}
