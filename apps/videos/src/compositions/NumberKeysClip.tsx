import { Button } from "@pp/ui/button"
import {
  Bug,
  CircleDashed,
  CircleDot,
  Hammer,
  Layers,
  PriorityMedium,
  Shirt,
  Sparkles,
  type IconType
} from "@pp/ui/icons"
import { Kbd } from "@pp/ui/kbd"
import { transitions } from "@pp/ui/lib/springs"
import { cn } from "@pp/ui/lib/utils"
import {
  menuItemClass,
  menuSeparatorClass,
  menuSurfaceClass
} from "@pp/ui/menu-styles"
import { Fragment, type ReactNode } from "react"
import { useCurrentFrame } from "remotion"

import { Stage, useSettledFrame, type ClipProps } from "../parts/clip"
import { ease, frames, mix, press, progress } from "../parts/motion"

/*
 * Number keys in pickers, 6.5 seconds, on a ticket's properties:
 *
 *   0.6  the Type menu opens; every row has its digit
 *   1.9  3 is pressed: the highlight jumps to Chore, it's picked, the menu
 *        closes and Type says Chore
 *   2.9  the Estimate menu opens (at rest through the middle frame)
 *   4.3  4 is pressed: L is picked, and Estimate says L
 *   4.9  at rest
 *
 * The menus are drawn from the menu's own classes so the frame can drive
 * them, as CommentThreadsClip does; times are the app's, slowed by SLOW.
 */

export const NUMBER_KEYS_FRAMES = 195

const SLOW = 2
const POP_FRAMES = frames(transitions.pop.duration * SLOW)
const FADE_FRAMES = frames(transitions.fade.duration * SLOW)

const ZOOM = 1.75

type Option = Readonly<{
  label: string
  icon: IconType
  color?: string
  separated?: boolean
}>

// The built-in types, in the menu's order, then "No type".
const TYPES: ReadonlyArray<Option> = [
  { label: "Feature", icon: Sparkles, color: "#70b445" },
  { label: "Bug", icon: Bug, color: "#f16f7e" },
  { label: "Chore", icon: Hammer, color: "#d78d00" },
  { label: "Epic", icon: Layers, color: "#53a0ff", separated: true },
  { label: "No type", icon: CircleDashed }
]

const SIZES: ReadonlyArray<Option> = ["XS", "S", "M", "L", "XL"].map(
  (label) => ({ label, icon: Shirt })
)

type Pick = Readonly<{
  // The trigger is pressed, then the menu opens.
  open: number
  // The digit goes down; the highlight and the pick follow.
  key: number
  from: number
  to: number
}>

const TYPE_PICK: Pick = { open: 18, key: 58, from: 0, to: 2 }
const SIZE_PICK: Pick = { open: 86, key: 128, from: -1, to: 3 }

// The highlight lands on the digit's row as the key goes down; the pick
// closes the menu a beat later.
const PICKED = 4
const CLOSE = 10

export function NumberKeysClip({ theme }: ClipProps) {
  const frame = useCurrentFrame()
  useSettledFrame(frame)
  const enter = ease(frame, 0, 18)
  const type = frame >= TYPE_PICK.key + PICKED ? TYPES[2] : TYPES[0]
  const size = frame >= SIZE_PICK.key + PICKED ? SIZES[3] : null
  // One key at a time, on the stage's floor: what's being pressed.
  const keyPick = frame < SIZE_PICK.open ? TYPE_PICK : SIZE_PICK

  return (
    <Stage theme={theme}>
      <div
        className="relative w-[340px]"
        style={{
          zoom: ZOOM,
          opacity: enter,
          translate: `0 ${mix(enter, 10, 0) - 88}px`
        }}
      >
        <div className="flex flex-col gap-0.5 on-surface-mix text-caption [--surface:var(--page)]">
          <Row label="Status">
            <Value icon={<CircleDot className="size-3.5 text-state-info" />}>
              In progress
            </Value>
          </Row>
          <Row label="Priority">
            <Value icon={<PriorityMedium className="size-3.5" />}>Medium</Value>
          </Row>
          <Row label="Type">
            <Value
              open={frame >= TYPE_PICK.open && frame < closeAt(TYPE_PICK)}
              scale={press(frame, TYPE_PICK.open - 6)}
              icon={
                <type.icon
                  className="size-3.5"
                  strokeWidth={1.75}
                  style={{ color: type.color }}
                />
              }
            >
              {type.label}
            </Value>
            <Menu frame={frame} pick={TYPE_PICK} options={TYPES} top={34} />
          </Row>
          <Row label="Estimate">
            <Value
              empty={size === null}
              open={frame >= SIZE_PICK.open && frame < closeAt(SIZE_PICK)}
              scale={press(frame, SIZE_PICK.open - 6)}
              icon={<Shirt className="size-3.5" strokeWidth={1.75} />}
            >
              {size?.label ?? "Set estimate"}
            </Value>
            <Menu frame={frame} pick={SIZE_PICK} options={SIZES} top={34} />
          </Row>
        </div>
      </div>
      <KeyPress frame={frame} pick={keyPick} />
    </Stage>
  )
}

const closeAt = (pick: Pick) => pick.key + CLOSE

function Row({
  label,
  children
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="relative grid grid-cols-[96px_1fr] items-center">
      <span className="text-muted-foreground">{label}</span>
      <div className="relative min-w-0">{children}</div>
    </div>
  )
}

function Value({
  icon,
  empty = false,
  open = false,
  scale = 1,
  children
}: Readonly<{
  icon: ReactNode
  empty?: boolean
  open?: boolean
  scale?: number
  children: string
}>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      tone={empty ? "muted" : "strong"}
      tabIndex={-1}
      className={cn("-ml-3 gap-1.5", open && "bg-hover")}
      style={{ scale }}
    >
      {icon}
      {children}
    </Button>
  )
}

// A menu drawn from the menu's own classes: it grows out of its trigger,
// numbers its rows, and closes after the digit's pick, as the app's does.
function Menu({
  frame,
  pick,
  options,
  top
}: Readonly<{
  frame: number
  pick: Pick
  options: ReadonlyArray<Option>
  top: number
}>) {
  const open = ease(frame, pick.open, pick.open + POP_FRAMES)
  const close = ease(frame, closeAt(pick), closeAt(pick) + FADE_FRAMES)
  if (open <= 0 || close >= 1) return null
  const picked = frame >= pick.key + PICKED
  const lit = frame >= pick.key ? pick.to : pick.from
  const checked = picked ? pick.to : pick.from
  const dot = picked ? ease(frame, pick.key + PICKED, pick.key + PICKED + 8) : 1
  const keyDown = frame >= pick.key && frame < pick.key + 8
  return (
    <div
      className={cn(menuSurfaceClass, "absolute z-10 w-44")}
      style={{
        top,
        left: -12,
        opacity: open * (1 - close),
        scale: mix(open, 0.95, 1) * mix(close, 1, 0.97),
        translate: `0 ${mix(open, -8, 0)}px`,
        transformOrigin: "top left"
      }}
    >
      {options.map((option, index) => {
        const Icon = option.icon
        const isChecked = index === checked
        return (
          <Fragment key={option.label}>
            <div
              className={cn(
                menuItemClass,
                "relative isolate",
                isChecked && "font-semibold text-foreground"
              )}
              data-highlighted={index === lit ? "" : undefined}
            >
              {index === lit ? (
                <span className="absolute inset-0 -z-10 rounded-[inherit] bg-menu-active [corner-shape:inherit]" />
              ) : null}
              <span
                className="w-4 shrink-0"
                style={{ opacity: isChecked ? 1 : 0 }}
              >
                <svg viewBox="0 0 16 16" className="size-4 overflow-visible">
                  <circle
                    cx="8"
                    cy="8"
                    r="3"
                    className="fill-current"
                    style={{
                      scale: isChecked ? dot : 0,
                      transformOrigin: "center"
                    }}
                  />
                </svg>
              </span>
              <Icon
                className="size-4"
                strokeWidth={1.75}
                style={
                  option.color === undefined
                    ? undefined
                    : { color: option.color }
                }
              />
              <span className="truncate">{option.label}</span>
              <Kbd
                size="sm"
                aria-hidden
                data-pressed={keyDown && index === pick.to ? "" : undefined}
                className="mr-px ml-auto"
              >
                {String(index + 1)}
              </Kbd>
            </div>
            {option.separated ? <div className={menuSeparatorClass} /> : null}
          </Fragment>
        )
      })}
    </div>
  )
}

// The key being pressed, large on the stage's floor: it rises in just before
// the press, goes down with it and fades after the pick.
function KeyPress({ frame, pick }: Readonly<{ frame: number; pick: Pick }>) {
  const shown =
    ease(frame, pick.key - 14, pick.key - 4) *
    (1 - progress(frame, closeAt(pick) + 6, closeAt(pick) + 16))
  if (shown <= 0) return null
  const down = frame >= pick.key && frame < pick.key + 8
  return (
    <div
      className="absolute top-1/2 right-[150px] -translate-y-1/2"
      style={{ opacity: shown, translate: `${mix(shown, -8, 0)}px 0` }}
    >
      <Kbd
        aria-hidden
        data-pressed={down ? "" : undefined}
        className="h-14 min-w-14 rounded-[20px] px-4 text-title text-foreground"
        style={{ scale: press(frame, pick.key, 0.9, 10) }}
      >
        {String(pick.to + 1)}
      </Kbd>
    </div>
  )
}
