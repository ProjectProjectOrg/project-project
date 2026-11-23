import { NEUTRALS, SOFT_RING, STRONG_RING } from "@pp/shared"
import { useRef, type ReactNode } from "react"

import {
  contrast,
  ratio,
  toRgb,
  tokenColor,
  useTokenReading
} from "../../tokens"

function Group({
  title,
  note,
  children
}: Readonly<{ title: string; note: string; children: ReactNode }>) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-body font-semibold">{title}</h3>
        <p className="text-caption text-muted-foreground">{note}</p>
      </div>
      {children}
    </section>
  )
}

// The three layers, nested the way the app nests them, each named.
function Layers() {
  const label = "tabular-nums text-micro text-muted-foreground"
  return (
    <div className="rounded-[20px] surface-background p-3 corner-squircle">
      <p className={label}>--background · the frame</p>
      <div className="mt-2 rounded-[16px] surface-page p-3 corner-squircle">
        <p className={label}>--page · what pages sit on</p>
        <div className="mt-2 grid gap-3 @lg:grid-cols-2">
          <div className="rounded-[14px] surface-card p-3 corner-squircle">
            <p className={label}>--card · cards, popups</p>
            <div className="mt-2 flex h-8 items-center rounded-[16px] bg-field px-3 corner-squircle">
              <span className={label}>--field · inputs</span>
            </div>
          </div>
          <div className="rounded-[14px] bg-muted p-3 corner-squircle">
            <p className={label}>--muted · wells</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const INK_ON = [
  ["--background", "frame"],
  ["--page", "page"],
  ["--card", "card"],
  ["--field", "field"]
] as const

const INKS = [
  ["--foreground", "Text", 4.5],
  ["--muted-foreground", "Secondary text", 4.5],
  ["--ring", "Focus ring", 3],
  ["--checkbox-ring", "Control outline", 3]
] as const

// Each ink's contrast on each surface, measured in the current theme.
function Inks() {
  const scope = useRef<HTMLDivElement>(null)
  const readings = useTokenReading(scope, (el) =>
    INKS.map(([ink]) =>
      INK_ON.map(([surface]) => {
        const back = toRgb(tokenColor(el, surface))
        const front = toRgb(tokenColor(el, ink), `rgb(${back.join(",")})`)
        return contrast(front, back)
      })
    )
  )
  return (
    <div ref={scope} className="overflow-x-auto">
      <table className="w-full min-w-[30rem] text-caption">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1.5 pr-3 font-normal">Ink</th>
            {INK_ON.map(([token, name]) => (
              <th key={token} className="py-1.5 pr-3 font-normal">
                on {name}
              </th>
            ))}
            <th className="py-1.5 font-normal">Needs</th>
          </tr>
        </thead>
        <tbody>
          {INKS.map(([token, name, needs], row) => (
            <tr key={token} className="border-t border-border">
              <td className="py-2 pr-3">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: `var(${token})` }}
                  />
                  {name}
                  <code className="font-mono text-micro text-muted-foreground">
                    {token}
                  </code>
                </span>
              </td>
              {INK_ON.map(([surface], column) => {
                const value = readings?.[row]?.[column]
                return (
                  <td key={surface} className="py-2 pr-3 tabular-nums">
                    {value === undefined ? "…" : ratio(value)}
                  </td>
                )
              })}
              <td className="py-2 text-muted-foreground tabular-nums">
                {needs}:1
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const OVERLAYS = [
  ["bg-hover", "--hover", "Hover"],
  ["bg-active", "--active", "Pressed"],
  ["bg-tint", "--tint", "Secondary fill"],
  ["bg-menu-hover", "--menu-hover", "Menu hover"],
  ["bg-menu-active", "--menu-active", "Menu pressed"]
] as const

const BASES = [
  ["surface-background", "Frame"],
  ["surface-page", "Page"],
  ["surface-card", "Card"],
  ["surface-(--tooltip)", "Popup"],
  ["surface-(--tooltip-raised)", "Raised popup"],
  ["bg-[oklch(0.7_0.16_255)]", "A colour"]
] as const

// The same overlays on four surfaces: each reads as a step off whatever is
// under it, which a fixed grey never could.
function Overlays() {
  return (
    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 @xl:grid-cols-[repeat(3,minmax(0,1fr))]">
      {BASES.map(([base, name]) => (
        <div
          key={name}
          className={`${base} flex flex-col gap-1.5 rounded-[14px] p-2 corner-squircle`}
        >
          <span className="rounded-md bg-card/80 px-1.5 text-micro text-foreground">
            {name}
          </span>
          {OVERLAYS.map(([fill, token, label]) => (
            <span
              key={token}
              className={`${fill} flex h-7 items-center rounded-[14px] px-2.5 text-caption text-foreground corner-squircle`}
            >
              <span className="rounded-sm bg-card/80 px-1">{label}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

const STATES = [
  ["--state-success", "Success", "Open PRs, passing checks"],
  ["--state-info", "Info", "In-flight branches, active sprints"],
  ["--state-merged", "Merged", "Merged and closed"],
  ["--state-warning", "Warning", "Pending review"],
  ["--state-danger", "Danger", "Failed checks, blocked work"],
  ["--destructive", "Destructive", "Delete, irreversible actions"]
] as const

function States() {
  return (
    <ul className="grid gap-x-6 gap-y-2 @lg:grid-cols-2">
      {STATES.map(([token, name, use]) => (
        <li key={token} className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={{ background: `var(${token})` }}
          />
          <span className="text-caption font-semibold">{name}</span>
          <span className="truncate text-caption text-muted-foreground">
            {use}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Wheel() {
  const rows = [
    ["Strong", STRONG_RING],
    ["Soft", SOFT_RING],
    ["Neutral", NEUTRALS]
  ] as const
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([name, swatches]) => (
        <div key={name} className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-caption text-muted-foreground">
            {name}
          </span>
          <ul className="flex flex-wrap gap-1.5">
            {swatches.map((swatch) => (
              <li
                key={swatch.oklch}
                title={swatch.oklch}
                aria-label={swatch.oklch}
                className="size-6 rounded-full shadow-[inset_0_0_0_1px_oklch(0_0_0/0.08)] dark:shadow-[inset_0_0_0_1px_oklch(1_0_0/0.1)]"
                style={{ background: swatch.oklch }}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// The palette as the app uses it: three neutral layers, inks measured on
// them, overlays that work on any surface, a few state colours and the
// user's colours.
export default function ColourOverview() {
  return (
    <div className="@container flex w-full flex-col gap-8">
      <Group
        title="Layers"
        note="Three steps, the same order in both themes: frame, page, then cards, popups and fields."
      >
        <Layers />
      </Group>
      <Group
        title="Ink"
        note="Measured live in this theme. Text needs 4.5:1, outlines and focus 3:1."
      >
        <Inks />
      </Group>
      <Group
        title="Overlays"
        note="Hover, pressed and the secondary fill are see-through, so they work on any surface."
      >
        <Overlays />
      </Group>
      <Group title="State" note="Scarce, for state that must read at a glance.">
        <States />
      </Group>
      <Group
        title="The user's colours"
        note="Tags, statuses, projects: the picker's 12 strong, 6 soft and 4 neutral colours."
      >
        <Wheel />
      </Group>
    </div>
  )
}
