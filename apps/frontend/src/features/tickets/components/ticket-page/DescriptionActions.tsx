import { Button } from "@pp/ui/button"
import type { SaveStatus } from "@pp/ui/editor/save-queue"
import { Check, Pencil } from "@pp/ui/icons"
import { KbdShortcut } from "@pp/ui/kbd"
import { transitions } from "@pp/ui/lib/springs"
import { cn } from "@pp/ui/lib/utils"
import { TextSwap } from "@pp/ui/text-swap"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { appHotkeys } from "@/lib/appHotkeys"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

const morphFrom = { opacity: 0, filter: "blur(4px)" }
const morphTo = { opacity: 1, filter: "blur(0px)" }
const fadeOut = { opacity: 0 }
const SAVED_LINGER_S = 1.2
const slotOpen = { width: 14, marginRight: 0, opacity: 1 }
const slotClosed = { width: 0, marginRight: -6, opacity: 0 }

const statusLabel = {
  idle: () => "",
  dirty: m.tickets_save_status_dirty,
  saving: m.tickets_save_status_saving,
  saved: m.tickets_save_status_saved,
  failed: m.editor_save_failed
} satisfies Record<SaveStatus, () => string>

export function DescriptionActions({
  editing,
  status,
  onEdit,
  onDone
}: Readonly<{
  editing: boolean
  status: SaveStatus
  onEdit: () => void
  onDone: () => void
}>) {
  const reduce = useReducedMotion() ?? false
  const hidden = reduce ? fadeOut : morphFrom
  return (
    <div className="sticky top-7 z-10 float-right -mt-1 -mr-2 ml-3 flex w-36 justify-end">
      <AnimatePresence mode="popLayout" anchorX="right" initial={false}>
        <motion.div
          key={editing ? "done" : "edit"}
          initial={hidden}
          animate={morphTo}
          exit={hidden}
          transition={transitions.presence}
        >
          {editing ? (
            <Button
              variant="tertiary"
              tone={status === "failed" ? "error" : undefined}
              aria-keyshortcuts="Escape"
              onClick={onDone}
              title={status === "failed" ? m.editor_save_failed() : undefined}
            >
              <SaveDot status={status} />
              <MorphLabel>
                {status === "failed"
                  ? m.tickets_description_not_saved()
                  : m.tickets_description_done()}
              </MorphLabel>
              <KbdShortcut keys="Escape" keyLabels={keyLabels()} aria-hidden />
              <span aria-live="polite" className="sr-only">
                {statusLabel[status]()}
              </span>
            </Button>
          ) : (
            <Button
              variant="tertiary"
              leadingIcon={Pencil}
              aria-label={m.tickets_description_edit()}
              aria-keyshortcuts={
                appHotkeys["tickets.edit-description"].defaultHotkey
              }
              onClick={onEdit}
            >
              {m.tickets_description_edit_short()}
              <KbdShortcut
                keys={appHotkeys["tickets.edit-description"].defaultHotkey}
                keyLabels={keyLabels()}
                aria-hidden
              />
            </Button>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function SaveDot({ status }: Readonly<{ status: SaveStatus }>) {
  const open = status !== "idle" && status !== "saved"
  return (
    <motion.span
      aria-hidden
      initial={false}
      animate={open ? slotOpen : slotClosed}
      transition={
        status === "saved"
          ? { ...transitions.presence, delay: SAVED_LINGER_S }
          : transitions.presence
      }
      className="grid place-items-center"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {status === "saved" ? (
          <motion.span
            key="check"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={transitions.presence}
          >
            <Check className="size-3.5 text-foreground" strokeWidth={4} />
          </motion.span>
        ) : (
          <motion.span
            key="dot"
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.3 }}
            transition={transitions.presence}
            className={cn(
              "size-1.5 rounded-full bg-muted-foreground",
              status === "saving" && "motion-safe:animate-pulse",
              status === "failed" && "bg-destructive"
            )}
          />
        )}
      </AnimatePresence>
    </motion.span>
  )
}

// The status text beside the description's actions rolls through TextSwap.
function MorphLabel({ children }: Readonly<{ children: string }>) {
  return <TextSwap>{children}</TextSwap>
}
