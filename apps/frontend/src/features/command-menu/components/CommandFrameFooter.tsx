import {
  CommandMenuFooter,
  CommandMenuFooterHint,
  CommandMenuShortcut,
  useHighlightedItem
} from "@pp/ui/command-menu"
import { spring } from "@pp/ui/lib/springs"
import type { Hotkey } from "@tanstack/react-hotkeys"
import { motion, useReducedMotion } from "motion/react"

import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

import type { CommandFrameItem } from "./CommandFrame"

function KeyFirst({ keys, label }: Readonly<{ keys: Hotkey; label: string }>) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <CommandMenuShortcut
        keyLabels={keyLabels()}
        keys={keys}
        className="ml-0"
      />
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
    <CommandMenuFooter divider>
      <motion.div
        initial={reduceMotion ? false : { y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={spring.moderate}
        className="flex min-w-0 flex-1 items-center gap-4"
      >
        {shown !== null && (
          <KeyFirst
            keys="Enter"
            label={shown.enterLabel ?? m.chrome_command_menu_run()}
          />
        )}
        <span className="ml-auto flex items-center gap-4">
          {shown?.actionable === true && (
            <KeyFirst keys="Tab" label={m.chrome_command_menu_actions()} />
          )}
          {peekOpen ? (
            <CommandMenuFooterHint
              keyLabels={keyLabels()}
              label={m.chrome_command_menu_close_peek()}
              keys="ArrowLeft"
            />
          ) : (
            shown?.peekable === true && (
              <CommandMenuFooterHint
                keyLabels={keyLabels()}
                label={m.chrome_command_menu_peek()}
                keys="ArrowRight"
              />
            )
          )}
        </span>
      </motion.div>
    </CommandMenuFooter>
  )
}
