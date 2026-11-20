import { badgeVariants } from "@pp/ui/badge"
import { CollapsingLabel } from "@pp/ui/collapsing-label"
import {
  Bug,
  CircleDashed,
  Flag,
  Layers,
  Sparkles,
  SquareCheck,
  Zap,
  type IconType
} from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { menuItemMetaClass } from "@pp/ui/menu-styles"
import type { SelectOption } from "@pp/ui/select"
import { TextSwap } from "@pp/ui/text-swap"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject
} from "react"

export type TicketType = Readonly<{
  key: string
  name: string
  icon: IconType
  color: string
  start: ReadonlyArray<string> | null
}>

export const TYPES: ReadonlyArray<TicketType> = [
  {
    key: "bug",
    name: "Bug",
    icon: Bug,
    color: "var(--state-danger)",
    start: ["Steps to reproduce", "Expected", "Actual"]
  },
  {
    key: "feature",
    name: "Feature",
    icon: Sparkles,
    color: "var(--state-merged)",
    start: ["Problem", "Proposal", "Out of scope"]
  },
  {
    key: "task",
    name: "Task",
    icon: SquareCheck,
    color: "var(--state-info)",
    start: null
  },
  {
    key: "epic",
    name: "Epic",
    icon: Layers,
    color: "var(--state-warning)",
    start: ["Goal", "Tickets"]
  }
]

export const NO_TYPE = "none"

export type Sprint = Readonly<{
  id: string
  name: string
  state: "active" | "planned"
  range: string
}>

export const SPRINTS: ReadonlyArray<Sprint> = [
  { id: "s14", name: "Sprint 14", state: "active", range: "Nov 10 – 21" },
  { id: "s15", name: "Sprint 15", state: "planned", range: "Nov 24 – Dec 5" }
]

export const NO_SPRINT = "none"

const SPRINT_ICON = {
  active: { icon: Zap, className: "text-state-info" },
  planned: { icon: Flag, className: "text-muted-foreground" }
} as const

export function TypeGlyph({ type }: Readonly<{ type: TicketType | null }>) {
  const Icon = type?.icon ?? CircleDashed
  return (
    <Icon
      aria-hidden
      strokeWidth={1.75}
      className={cn(
        "size-4 shrink-0",
        type === null && "text-muted-foreground"
      )}
      style={type ? { color: type.color } : undefined}
    />
  )
}

export function SprintGlyph({ sprint }: Readonly<{ sprint: Sprint }>) {
  const { icon: Icon, className } = SPRINT_ICON[sprint.state]
  return (
    <Icon
      aria-hidden
      strokeWidth={1.75}
      className={cn("size-4 shrink-0", className)}
    />
  )
}

// Wait in animation frames, standing in for the create request.
export function waitFrames(ms: number) {
  const end = performance.now() + ms
  return new Promise<void>((resolve) => {
    const tick = (now: number) => {
      if (now >= end) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

// --- useCreatorFocus: active while focus or a pointer is inside the form,
// or inside a popup one of its controls owns (through aria-controls).
const ownsNode = (container: HTMLElement, node: EventTarget | null) => {
  if (!(node instanceof Node)) return false
  if (container.contains(node)) return true
  return Array.from(container.querySelectorAll("[aria-controls]")).some(
    (control) =>
      document
        .getElementById(control.getAttribute("aria-controls") ?? "")
        ?.contains(node) ?? false
  )
}

export function useCreatorFocus(containerRef: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false)
  const activeRef = useRef(false)

  const leave = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    setActive(false)
  }, [])

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const container = containerRef.current
      if (!container) return
      if (!ownsNode(container, event.target)) return leave()
      activeRef.current = true
      setActive(true)
    }
    const onPointerDown = (event: PointerEvent) => {
      const container = containerRef.current
      if (container && !ownsNode(container, event.target)) leave()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const container = containerRef.current
      if (event.key !== "Escape" || event.defaultPrevented) return
      if (!activeRef.current) return
      if (!(event.target instanceof Node) || !container?.contains(event.target))
        return
      event.preventDefault()
      if (event.target instanceof HTMLElement) event.target.blur()
      leave()
    }
    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [containerRef, leave])

  return { active, leave }
}

// The page-wide `c` shortcut: focuses the field unless you're typing.
export function useShortcut(
  key: string,
  target: RefObject<HTMLInputElement | null>
) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== key || event.metaKey || event.ctrlKey || event.altKey)
        return
      const el = event.target
      if (
        el instanceof HTMLElement &&
        (el.isContentEditable ||
          el.closest("input, textarea, select, [role=listbox], [role=menu]"))
      )
        return
      event.preventDefault()
      target.current?.focus()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [key, target])
}

// --- CreatorChip: a glyph at rest; when the creator expands it takes a tinted
// background and its label slides out next to the glyph.
export function CreatorChip({
  expanded,
  icon,
  label,
  labelClassName = "max-w-[16ch]",
  className,
  ...props
}: Readonly<
  Omit<ComponentProps<"button">, "children"> & {
    expanded: boolean
    icon: ReactNode
    label: string
    labelClassName?: string
  }
>) {
  return (
    <button
      type="button"
      {...props}
      data-tone={expanded ? "muted" : undefined}
      className={cn(
        expanded
          ? cn(badgeVariants({ tone: "muted" }), "px-2")
          : "px-1 text-muted-foreground hover:bg-hover hover:text-foreground",
        "focus-ring inline-flex h-6 shrink-0 items-center gap-1.5 rounded-[12px] transition-[padding,background-color,color,scale] duration-[200ms,200ms,200ms,100ms] ease-[cubic-bezier(0,0,0.2,1)] outline-none [corner-shape:var(--button-corner)] active:scale-[0.97]",
        className
      )}
    >
      {icon}
      <CollapsingLabel show={expanded} gap={6}>
        <TextSwap className={cn("text-caption", labelClassName)}>
          {label}
        </TextSwap>
      </CollapsingLabel>
    </button>
  )
}

// Menus closed by picking an item hand focus back to the title field; a click
// outside closes the creator instead.
export function useMenuFocus(inputRef: RefObject<HTMLInputElement | null>) {
  const reason = useRef<string | null>(null)
  return {
    onOpenChange: (open: boolean, details: { reason: string }) => {
      reason.current = open ? null : details.reason
    },
    finalFocus: () => {
      switch (reason.current) {
        case "item-press":
          return inputRef.current
        case "outside-press":
        case "focus-out":
          return false
        default:
          return true
      }
    }
  }
}

export const startsWith = (type: TicketType | null) =>
  type?.start
    ? `Starts with: ${new Intl.ListFormat("en", { style: "short", type: "unit" }).format(type.start)}`
    : "Starts with an empty description"

export const typeItems = (lastUsed: string) => [
  ...TYPES.map((option, index) => ({
    value: option.key,
    textValue: option.name,
    separated: index === TYPES.length - 1,
    label: (
      <>
        <TypeGlyph type={option} />
        <span className="truncate">{option.name}</span>
        {option.key === lastUsed && (
          <span className="ml-auto shrink-0 text-micro text-muted-foreground">
            last used
          </span>
        )}
      </>
    )
  })),
  {
    value: NO_TYPE,
    textValue: "No type",
    label: (
      <>
        <TypeGlyph type={null} />
        <span className="truncate">No type</span>
      </>
    )
  }
]

export const sprintItems: ReadonlyArray<SelectOption<string>> = [
  ...SPRINTS.map((option, index) => ({
    value: option.id,
    textValue: option.name,
    separated: index === SPRINTS.length - 1,
    label: (
      <>
        <SprintGlyph sprint={option} />
        <span className="min-w-0 flex-1 truncate">{option.name}</span>
        <span data-menu-meta className={menuItemMetaClass}>
          {option.range}
        </span>
      </>
    )
  })),
  {
    value: NO_SPRINT,
    textValue: "No sprint",
    label: (
      <>
        <CircleDashed strokeWidth={1.75} />
        No sprint
      </>
    )
  }
]
