"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useLayoutEffect, useRef, useState } from "react"

import { springs } from "@/lib/springs"
import { cn } from "@/lib/utils"

export type HighlightTone = "default" | "destructive"

export type HighlightRect = Readonly<{
  top: number
  left: number
  width: number
  height: number
  tone: HighlightTone
}>

type HighlightState = Readonly<{
  rect: HighlightRect | null
  session: number
}>

const HIGHLIGHTED = "[data-highlighted]"

const toneOf = (element: HTMLElement): HighlightTone =>
  element.dataset.variant === "destructive" ? "destructive" : "default"

export const measureHighlight = (
  container: HTMLElement,
  selector: string = HIGHLIGHTED
): HighlightRect | null => {
  const element = Array.from(
    container.querySelectorAll<HTMLElement>(selector)
  ).find(
    (candidate) => candidate.closest("[data-menu-highlight-host]") === container
  )
  if (element === undefined) return null
  return {
    top: element.offsetTop,
    left: element.offsetLeft,
    width: element.offsetWidth,
    height: element.offsetHeight,
    tone: toneOf(element)
  }
}

const sameRect = (a: HighlightRect | null, b: HighlightRect | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height &&
    a.tone === b.tone)

export const nextHighlight = (
  previous: HighlightState,
  rect: HighlightRect | null
): HighlightState => {
  if (sameRect(previous.rect, rect)) return previous
  const fresh = previous.rect === null && rect !== null
  return { rect, session: fresh ? previous.session + 1 : previous.session }
}

function observeHighlight(container: HTMLElement, measure: () => void) {
  container.setAttribute("data-menu-highlight-host", "")
  measure()
  const mutations = new MutationObserver(measure)
  mutations.observe(container, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-highlighted"]
  })
  const resizes =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
  resizes?.observe(container)
  return () => {
    mutations.disconnect()
    resizes?.disconnect()
    container.removeAttribute("data-menu-highlight-host")
  }
}

function useHighlightRect(
  anchorRef: React.RefObject<HTMLElement | null>,
  selector: string
): HighlightState {
  const [state, setState] = useState<HighlightState>({
    rect: null,
    session: 0
  })

  useLayoutEffect(() => {
    const container = anchorRef.current?.parentElement
    return container
      ? observeHighlight(container, () =>
          setState((previous) =>
            nextHighlight(previous, measureHighlight(container, selector))
          )
        )
      : undefined
  }, [anchorRef, selector])

  return state
}

const TONES: Record<HighlightTone, string> = {
  default: "bg-accent/40 dark:bg-accent/25",
  destructive: "bg-destructive/10 dark:bg-destructive/20"
}

export function MenuHighlight({
  selector = HIGHLIGHTED,
  className
}: Readonly<{ selector?: string; className?: string }>) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const { rect, session } = useHighlightRect(anchorRef, selector)
  const reduceMotion = useReducedMotion() ?? false

  return (
    <span ref={anchorRef} aria-hidden className="contents">
      <AnimatePresence>
        {rect === null ? null : (
          <motion.span
            key={session}
            data-slot="menu-highlight"
            data-tone={rect.tone}
            className={cn(
              "pointer-events-none absolute top-0 left-0 block rounded-md",
              TONES[rect.tone],
              className
            )}
            initial={{
              opacity: 1,
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            }}
            animate={{
              opacity: 1,
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height
            }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={reduceMotion ? { duration: 0 } : springs.fast}
          />
        )}
      </AnimatePresence>
    </span>
  )
}
