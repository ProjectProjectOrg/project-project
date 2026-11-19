import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import * as React from "react"

import { transitions } from "../lib/springs"
import { TextSwap } from "./text-swap"

// What a field holds, side by side: up to four of its values' icons
// (statuses, priorities, label dots), then "+N". They sit apart, never
// overlapping: a status's circle cut by the next reads as a different
// glyph. (People overlap, but they use AvatarStack.) Give each child a key
// (the value): a value joining or leaving the selection grows or shrinks in
// place, so the field, and the bar with it, eases to its new width. Render
// it for a single value too, so a field going from one value to several
// only gains icons.
export function SelectionBarStack({
  children,
  max = 4
}: Readonly<{
  children: React.ReactNode
  max?: number
}>) {
  const items = React.Children.toArray(children).filter(React.isValidElement)
  const shown = items.slice(0, max)
  const more = items.length - shown.length
  const scale = (useReducedMotion() ?? false) ? 1 : 0.6
  return (
    <span className="flex shrink-0 items-center">
      <AnimatePresence initial={false}>
        {shown.map((child, index) => (
          <motion.span
            key={child.key}
            initial={{ opacity: 0, scale, width: 0, marginLeft: 0 }}
            animate={{
              opacity: 1,
              scale: 1,
              width: "auto",
              marginLeft: index === 0 ? 0 : 2
            }}
            exit={{ opacity: 0, scale, width: 0, marginLeft: 0 }}
            transition={transitions.morph}
            className="flex shrink-0 justify-center"
          >
            <span className="grid shrink-0 place-items-center [&_svg]:size-3.5">
              {child}
            </span>
          </motion.span>
        ))}
        {more > 0 && (
          <motion.span
            key="more"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            transition={transitions.morph}
            className="flex shrink-0 overflow-hidden"
          >
            <span className="pl-1 text-caption text-muted-foreground tabular-nums">
              <TextSwap>{`+${more}`}</TextSwap>
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
