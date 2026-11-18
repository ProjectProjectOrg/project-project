import { useRender } from "@base-ui/react/use-render"
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants
} from "motion/react"
import { type ComponentProps, type ReactNode } from "react"

import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { ChevronLeft } from "./icons"

// How the panel's content changes: up/down when the rail switches scope (the
// new item is below/above the old one), forward/back when drilling into or out
// of a sub-page such as settings.
type SidebarPanelTransition = "up" | "down" | "forward" | "back" | "none"

type SidebarPanelProps = Readonly<{
  panelKey: string
  // The panel's SidebarPanelHeader, drawn above the content and moving as one
  // piece with the content. A sub-page such as settings has none.
  header?: ReactNode
  transition?: SidebarPanelTransition
  children: ReactNode
  className?: string
}>

// Only sub-pages move: settings slides in from the right (`forward`) and
// back out to the left (`back`), which says where you went. Switching
// projects on the rail (`up`, `down`) swaps the content at once; motion there
// told you nothing the bar doesn't.
const PANEL_SHIFT = { forward: 16, back: -16 } as const

const moves = (
  transition: SidebarPanelTransition
): transition is keyof typeof PANEL_SHIFT =>
  transition === "forward" || transition === "back"

// The page header's swaps blur the same way (ProjectHeader's MorphSlot).
const BLUR = "blur(4px)"
const SHARP = "blur(0px)"

const shiftX = (
  transition: keyof typeof PANEL_SHIFT,
  reduce: boolean,
  sign: 1 | -1
) => (reduce ? 0 : PANEL_SHIFT[transition] * sign)

function panelVariants(reduce: boolean): Variants {
  return {
    enter: (t: SidebarPanelTransition) =>
      moves(t)
        ? {
            opacity: 0,
            filter: reduce ? SHARP : BLUR,
            x: shiftX(t, reduce, 1)
          }
        : { opacity: 1, x: 0 },
    shown: {
      opacity: 1,
      filter: SHARP,
      x: 0,
      transition: { ...transitions.layout, duration: 0.12 },
      // A leftover filter would make the panel a containing block for
      // anything fixed inside it.
      transitionEnd: { filter: "none" }
    },
    exit: (t: SidebarPanelTransition) =>
      moves(t)
        ? {
            opacity: 0,
            filter: reduce ? SHARP : BLUR,
            x: shiftX(t, reduce, -1),
            // Ease in, so the old state fades through its whole 70ms
            // instead of vanishing at once and leaving a blank beat.
            transition: { duration: 0.07, ease: [0.4, 0, 1, 1] as const }
          }
        : { opacity: 0, transition: { duration: 0 } }
  }
}

function SidebarPanel({
  panelKey,
  transition = "none",
  header,
  children,
  className
}: SidebarPanelProps) {
  const reduce = useReducedMotion() ?? false
  const variants = panelVariants(reduce)
  return (
    <div
      data-slot="sidebar-panel"
      className={cn("relative flex min-h-0 w-59 flex-col", className)}
    >
      {/* One state at a time: the old content leaves, then the new arrives.
          A rail switch has nothing to animate, so it swaps in one frame. The
          header moves with the content, as one piece. */}
      <AnimatePresence initial={false} mode="wait" custom={transition}>
        <motion.div
          key={panelKey}
          custom={transition}
          className="flex min-h-0 w-59 flex-1 flex-col py-2"
          variants={variants}
          initial="enter"
          animate="shown"
          exit="exit"
        >
          {header}
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

type SidebarBackProps = Omit<ComponentProps<"button">, "children"> &
  Readonly<{
    label: string
    render?: useRender.RenderProp
  }>

// The way out of a sub-page: sits above the sub-page's header.
// mt-3.5 centres it (28px) on the rail's top item, 36px down, when it's the
// first thing in a panel.
function SidebarBack({ label, render, className, ...props }: SidebarBackProps) {
  return useRender({
    defaultTagName: "button",
    render,
    props: {
      type: render === undefined ? ("button" as const) : undefined,
      ...props,
      "data-slot": "sidebar-back",
      className: cn(
        "focus-ring mx-2 mt-3.5 mb-1 flex h-7 w-fit cursor-pointer items-center gap-1 rounded-[14px] pr-2.5 pl-1.5 text-body text-muted-foreground transition-[color,background-color,scale] duration-100 select-none [corner-shape:var(--button-corner)] hover:bg-hover hover:text-foreground active:scale-[0.97] [&_svg]:size-4",
        className
      ),
      children: (
        <>
          <ChevronLeft strokeWidth={1.75} />
          {label}
        </>
      )
    }
  })
}

export { SidebarBack, SidebarPanel }
export type { SidebarBackProps, SidebarPanelProps, SidebarPanelTransition }
