import { Button } from "@pp/ui/button"
import { Check, Rocket } from "@pp/ui/icons"
import type { ReactNode } from "react"
import { AbsoluteFill, useCurrentFrame } from "remotion"

import { Stage, type ClipProps } from "../parts/clip"
import {
  GLIDE,
  LAND,
  mix,
  POP,
  press,
  progress,
  springAt
} from "../parts/motion"
import {
  CheckboxTile,
  IconsTile,
  KbdTile,
  OrbsTile,
  ProjectsTile,
  SwitchTile
} from "../parts/redesign-tiles"

/*
 * The redesign's headline clip, 8 seconds:
 *
 *   0.0  an ink circle pops in
 *   0.5  its corners ease out of round into the house squircle
 *   1.3  it stretches into a primary button and is pressed
 *   2.5  the kit bursts out of it into a bento of tiles
 *   3.2  each tile plays: orbs, project tiles, check, switch, icons, ⌘K
 *   5.0  the button rolls its label to "Shipped"
 *   5.9  the tiles fall back into the middle
 *   6.6  "A new look", its full stop the squircle from the start
 */

export const REDESIGN_FRAMES = 240

const W = 1280
const H = 720
const TILE = 250
const GAP = 20
const GRID_W = TILE * 4 + GAP * 3
const GRID_H = TILE * 2 + GAP
const GRID_X = (W - GRID_W) / 2
const GRID_Y = (H - GRID_H) / 2

// Beats, in frames.
const BURST = 76
const EXIT = 178
const TITLE = 198

// The button, 140×36 at zoom 4, and where it ends up.
const BUTTON_W = 560
const BUTTON_H = 144

type Slot = Readonly<{ col: number; row: number; span?: number }>

const slotBox = ({ col, row, span = 1 }: Slot) => ({
  x: GRID_X + col * (TILE + GAP),
  y: GRID_Y + row * (TILE + GAP),
  w: TILE * span + GAP * (span - 1),
  h: TILE
})

const BUTTON_SLOT: Slot = { col: 1, row: 0, span: 2 }

const TILES: ReadonlyArray<
  Readonly<{
    key: string
    slot: Slot
    spin: number
    render: (frame: number) => ReactNode
  }>
> = [
  {
    key: "checkbox",
    slot: { col: 0, row: 0 },
    spin: -14,
    render: (frame) => <CheckboxTile frame={frame} at={112} />
  },
  { key: "button", slot: BUTTON_SLOT, spin: 0, render: () => null },
  {
    key: "switch",
    slot: { col: 3, row: 0 },
    spin: 12,
    render: (frame) => <SwitchTile frame={frame} at={124} />
  },
  {
    key: "orbs",
    slot: { col: 0, row: 1 },
    spin: 10,
    render: (frame) => <OrbsTile frame={frame} at={92} />
  },
  {
    key: "projects",
    slot: { col: 1, row: 1 },
    spin: -8,
    render: (frame) => <ProjectsTile frame={frame} at={98} />
  },
  {
    key: "icons",
    slot: { col: 2, row: 1 },
    spin: 9,
    render: (frame) => <IconsTile frame={frame} at={104} />
  },
  {
    key: "kbd",
    slot: { col: 3, row: 1 },
    spin: -12,
    render: (frame) => <KbdTile frame={frame} at={136} />
  }
]

// Frozen frames: no CSS transition or animation may run between them.
const STILL =
  "[data-clip=redesign] *, [data-clip=redesign] *::before, [data-clip=redesign] *::after { transition: none !important; animation: none !important; }"

export function RedesignClip({ theme }: ClipProps) {
  const frame = useCurrentFrame()
  return (
    <Stage theme={theme} caption="">
      <style>{STILL}</style>
      <AbsoluteFill data-clip="redesign" className="bg-background">
        {TILES.map((tile, index) => (
          <Tile
            key={tile.key}
            index={index}
            frame={frame}
            slot={tile.slot}
            spin={tile.spin}
            render={tile.render}
          />
        ))}
        <Hero frame={frame} />
        <Title frame={frame} />
      </AbsoluteFill>
    </Stage>
  )
}

// A tile flies out of the button to its slot, and back in at the end.
function Tile({
  index,
  frame,
  slot,
  spin,
  render
}: Readonly<{
  index: number
  frame: number
  slot: Slot
  spin: number
  render: (frame: number) => ReactNode
}>) {
  const box = slotBox(slot)
  const enter = springAt(frame, BURST + index * 2, LAND)
  const leave = springAt(frame, EXIT + (6 - index) * 1.5, GLIDE, 18)
  const t = enter * (1 - leave)
  const dx = W / 2 - (box.x + box.w / 2)
  const dy = H / 2 - (box.y + box.h / 2)
  return (
    <div
      className="absolute grid place-items-center overflow-hidden rounded-[44px] bg-card [corner-shape:var(--button-corner)]"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        translate: `${dx * (1 - t)}px ${dy * (1 - t)}px`,
        scale: mix(t, 0.2, 1),
        rotate: `${spin * (1 - t)}deg`,
        opacity: Math.min(1, t * 3)
      }}
    >
      {render(frame)}
    </div>
  )
}

// The circle that becomes a squircle, then a button, then a tile's content.
function Hero({ frame }: Readonly<{ frame: number }>) {
  // Already on screen at frame 0, so the still that stands in for the clip
  // (reduced motion, before it loads) is never blank.
  const appear = springAt(frame, -6, POP)
  // Round (1) to the house squircle (1.5), overshooting on the way.
  const corner = springAt(frame, 16, { damping: 7, stiffness: 120 })
  const k = mix(corner, 1, 1.5)
  const stretch = springAt(frame, 40, LAND)
  const w = mix(stretch, 240, BUTTON_W)
  const h = mix(stretch, 240, BUTTON_H)

  // The real Button takes over once the shape has its size.
  const swap = progress(frame, 52, 58)
  const pressed = press(frame, 64, 0.94, 10)

  // To its slot when the kit bursts out, and away at the end.
  const box = slotBox(BUTTON_SLOT)
  const move = springAt(frame, BURST, LAND)
  const leave = springAt(frame, EXIT + 6, GLIDE, 18)
  const t = move * (1 - leave)
  const y = mix(t, H / 2, box.y + box.h / 2)
  const scale = mix(t, 1, 0.8) * mix(leave, 1, 0.2) * pressed
  const fade = 1 - progress(frame, EXIT + 10, EXIT + 18)

  // The ghost of the round corner, for the eye to compare with.
  const ghost = progress(frame, 14, 20) * (1 - progress(frame, 34, 42)) * appear

  const roll = springAt(frame, 150, { damping: 15, stiffness: 190 })

  return (
    <div
      className="absolute"
      style={{
        left: W / 2,
        top: y,
        translate: "-50% -50%",
        scale,
        opacity: fade
      }}
    >
      <div
        className="absolute top-1/2 left-1/2 rounded-full border-[3px] border-dashed border-muted-foreground"
        style={{
          width: 240,
          height: 240,
          translate: "-50% -50%",
          opacity: ghost
        }}
      />
      <div
        className="bg-primary [corner-shape:superellipse(var(--k))]"
        style={{
          width: w,
          height: h,
          borderRadius: h / 2,
          "--k": k,
          scale: appear * press(frame, 150, 0.95, 10),
          opacity: 1 - progress(frame, 58, 60)
        }}
      />
      <div
        className="absolute inset-0 grid place-items-center"
        style={{ opacity: swap, scale: press(frame, 148, 0.95, 10) }}
      >
        <Button size="lg" className="w-[140px] [zoom:4]" tabIndex={-1}>
          <span className="relative block h-5 w-[86px] overflow-hidden">
            <Label y={-roll * 100} icon={<Rocket size={16} />}>
              Ship it
            </Label>
            <Label y={100 - roll * 100} icon={<Check size={16} />}>
              Shipped
            </Label>
          </span>
        </Button>
      </div>
    </div>
  )
}

function Label({
  y,
  icon,
  children
}: Readonly<{ y: number; icon: ReactNode; children: ReactNode }>) {
  return (
    <span
      className="absolute inset-0 flex items-center justify-center gap-1.5"
      style={{
        translate: `0 ${y}%`,
        filter: `blur(${Math.min(3, Math.abs(y) / 25)}px)`,
        opacity: 1 - Math.min(1, Math.abs(y) / 80)
      }}
    >
      {icon}
      {children}
    </span>
  )
}

const WORDS = ["A", "new", "look"] as const

// "A new look", each word rising in, the full stop the squircle.
function Title({ frame }: Readonly<{ frame: number }>) {
  if (frame < TITLE - 2) return null
  const dot = springAt(frame, TITLE + WORDS.length * 4 + 2, POP)
  return (
    <AbsoluteFill className="flex-row items-center justify-center">
      <p className="flex items-baseline gap-[0.26em] text-[132px] leading-none font-semibold tracking-[-0.035em]">
        {WORDS.map((word, index) => {
          const rise = springAt(frame, TITLE + index * 4, LAND)
          return (
            <span
              key={word}
              className="inline-block"
              style={{
                translate: `0 ${(1 - rise) * 70}px`,
                opacity: Math.min(1, rise * 1.6),
                filter: `blur(${Math.max(0, (1 - rise) * 12)}px)`
              }}
            >
              {word}
            </span>
          )
        })}
        <span
          className="-ml-[0.2em] inline-block size-[30px] rounded-[15px] bg-foreground [corner-shape:var(--button-corner)]"
          style={{ scale: dot }}
        />
      </p>
    </AbsoluteFill>
  )
}
