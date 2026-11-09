import { motion, useReducedMotion } from "motion/react"

import {
  CommandMenuFooter,
  CommandMenuFooterHint,
  CommandMenuShortcut,
  useHighlightedItem
} from "@/components/ui/command-menu"
import { springs } from "@/lib/springs"
import { m } from "@/paraglide/messages"

import type { CommandFrameItem } from "./CommandFrame"

function KeyFirst({ keys, label }: Readonly<{ keys: string; label: string }>) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <CommandMenuShortcut keys={keys} className="ml-0" />
      <span>{label}</span>
    </span>
  )
}

export function SearchFooter({
  decorations,
  peekOpen
}: Readonly<{
  decorations: ReadonlyMap<string, CommandFrameItem>
  peekOpen: boolean
}>) {
  const reduceMotion = useReducedMotion() ?? false
  const row = useHighlightedItem()
  const item = row === undefined ? undefined : decorations.get(row.value)
  const shown = item !== undefined && item.disabled !== true ? item : null
  if (shown === null && !peekOpen) return null
  return (
    <CommandMenuFooter className="border-t border-border/60">
      <motion.div
        initial={reduceMotion ? false : { y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={springs.moderate}
        className="flex min-w-0 flex-1 items-center gap-4"
      >
        {shown !== null && (
          <KeyFirst
            keys="enter"
            label={shown.enterLabel ?? m.chrome_command_menu_run()}
          />
        )}
        <span className="ml-auto flex items-center gap-4">
          {shown?.actionable === true && (
            <KeyFirst keys="tab" label={m.chrome_command_menu_actions()} />
          )}
          {peekOpen ? (
            <CommandMenuFooterHint
              label={m.chrome_command_menu_close_peek()}
              keys="arrowleft"
            />
          ) : (
            shown?.peekable === true && (
              <CommandMenuFooterHint
                label={m.chrome_command_menu_peek()}
                keys="arrowright"
              />
            )
          )}
        </span>
      </motion.div>
    </CommandMenuFooter>
  )
}
