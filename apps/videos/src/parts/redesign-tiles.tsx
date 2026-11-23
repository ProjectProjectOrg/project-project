import { checkboxClass, CHECK_PATH } from "@pp/ui/checkbox"
import {
  Layers,
  Palette,
  Sparkles,
  Zap,
  Heart,
  type IconType
} from "@pp/ui/icons"
import { Kbd } from "@pp/ui/kbd"
import { cn } from "@pp/ui/lib/utils"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { ProjectIcon } from "@pp/ui/project-icon"

import { mix, POP, press, progress, springAt } from "./motion"

// The contents of the redesign clip's tiles. Each one is drawn at video
// scale and driven by the frame it is given.

type At = Readonly<{ frame: number; at: number }>

// The Checkbox, built from its own classes so the fill and the check can be
// driven by the frame instead of its CSS transitions.
export function CheckboxTile({ frame, at }: At) {
  const fill = springAt(frame, at, POP)
  const mark = progress(frame, at + 3, at + 9)
  const checked = frame >= at
  return (
    <span
      className={cn(checkboxClass(), "[zoom:8]")}
      data-checked={checked ? "" : undefined}
      style={{ scale: press(frame, at - 4, 0.9) }}
    >
      <span
        className="absolute inset-0 rounded-[inherit] bg-foreground corner-squircle"
        style={{ scale: mix(fill, 0.4, 1), opacity: Math.min(1, fill * 2) }}
      />
      <svg viewBox="0 0 16 16" className="relative size-full overflow-visible">
        <path
          pathLength={1}
          d={CHECK_PATH}
          className="fill-none stroke-background stroke-[1.75] [stroke-linecap:round] [stroke-linejoin:round]"
          style={{ strokeDasharray: 1, strokeDashoffset: 1 - mark }}
        />
      </svg>
    </span>
  )
}

// The Switch, from its theme classes, its thumb driven by the frame: a
// small muted bar off, the full squircle on, stretching as it travels.
export function SwitchTile({ frame, at }: At) {
  const on = springAt(frame, at, { damping: 12, stiffness: 200 })
  const stretch =
    progress(frame, at - 6, at) * (1 - progress(frame, at, at + 6))
  const size = mix(on, 10, 16)
  return (
    <span
      className="pp-switch [zoom:6]"
      data-checked={frame >= at + 2 ? "" : undefined}
      style={{ scale: press(frame, at - 6, 0.94, 10) }}
    >
      <span
        className="pp-switch-thumb"
        style={{
          transition: "none",
          width: size + stretch * 4,
          height: size,
          margin: mix(on, 3, 0),
          borderRadius: size / 2,
          translate: `${mix(on, 0, 16) - stretch * 2 * on}px 0`
        }}
      />
    </span>
  )
}

const PEOPLE = [
  { id: "orb-ada", email: "" },
  { id: "orb-grace", email: "" },
  { id: "orb-linus", email: "" }
] as const

// Three generated orb avatars, popping in one after another.
export function OrbsTile({ frame, at }: At) {
  return (
    <span className="flex items-center">
      {PEOPLE.map((person, index) => {
        const pop = springAt(frame, at + index * 5, POP)
        return (
          <span
            key={person.id}
            className="rounded-full ring-[6px] ring-card"
            style={{
              marginLeft: index === 0 ? 0 : -12,
              scale: pop,
              rotate: `${(1 - pop) * -40}deg`,
              zIndex: 3 - index
            }}
          >
            <MemberAvatar member={person} size={84} />
          </span>
        )
      })}
    </span>
  )
}

const PROJECTS = [
  { seed: "tile-north", color: "#e0602a" },
  { seed: "tile-reef", color: "#2a8be0" },
  { seed: "tile-moss", color: "#4caf50" },
  { seed: "tile-dusk", color: "#9b5de5" }
] as const

// Multicolour project tiles, generated and dithered, in a 2x2 grid.
export function ProjectsTile({ frame, at }: At) {
  return (
    <span className="grid grid-cols-2 gap-3">
      {PROJECTS.map((project, index) => {
        const pop = springAt(frame, at + index * 4, POP)
        return (
          <span
            key={project.seed}
            className="block"
            style={{ scale: pop, rotate: `${(1 - pop) * 30}deg` }}
          >
            <ProjectIcon
              seed={project.seed}
              color={project.color}
              tone="multi"
              size={80}
            />
          </span>
        )
      })}
    </span>
  )
}

const ICONS: ReadonlyArray<readonly [string, IconType]> = [
  ["sparkles", Sparkles],
  ["palette", Palette],
  ["layers", Layers],
  ["zap", Zap],
  ["heart", Heart]
]
const ICON_SIZE = 112
const ICON_STEP = 14

// Hugeicons rolling through, one every ICON_STEP frames, like TextSwap.
export function IconsTile({ frame, at }: At) {
  const elapsed = Math.max(0, frame - at)
  const step = Math.min(ICONS.length - 1, Math.floor(elapsed / ICON_STEP))
  const roll = springAt(frame, at + step * ICON_STEP, {
    damping: 16,
    stiffness: 200
  })
  const offset = step === 0 ? 0 : step - 1 + roll
  return (
    <span
      className="relative block overflow-hidden"
      style={{ width: ICON_SIZE, height: ICON_SIZE * 1.3 }}
    >
      <span
        className="absolute inset-x-0 top-0 flex flex-col items-center"
        style={{ translate: `0 ${-offset * ICON_SIZE * 1.3}px` }}
      >
        {ICONS.map(([name, Icon], index) => (
          <span
            key={name}
            className="grid place-items-center"
            style={{
              height: ICON_SIZE * 1.3,
              opacity: 1 - Math.min(1, Math.abs(index - offset) * 1.2),
              filter: `blur(${Math.min(6, Math.abs(index - offset) * 10)}px)`
            }}
          >
            <Icon size={ICON_SIZE} strokeWidth={1.5} />
          </span>
        ))}
      </span>
    </span>
  )
}

// ⌘ K, the keys pressing in turn.
export function KbdTile({ frame, at }: At) {
  return (
    <span className="flex items-center gap-1 text-foreground [zoom:5]">
      <Kbd style={{ scale: press(frame, at, 0.86, 10) }}>⌘</Kbd>
      <Kbd style={{ scale: press(frame, at + 6, 0.86, 10) }}>K</Kbd>
    </span>
  )
}
