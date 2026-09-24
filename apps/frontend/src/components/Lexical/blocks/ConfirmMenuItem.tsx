import { X, type LucideIcon } from "lucide-react"
import { motion } from "motion/react"

import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

import { useSnapBack } from "./useSnapBack"

export function ConfirmMenuItem({
  icon: Icon,
  label,
  confirmName,
  message,
  action,
  disabled = false,
  onConfirm
}: Readonly<{
  icon: LucideIcon
  label: string
  confirmName: string
  message: string
  action: string
  disabled?: boolean
  onConfirm: () => void
}>) {
  const { armed, arm, disarm } = useSnapBack()

  return (
    <DropdownMenuItem
      disabled={disabled}
      closeOnClick={armed}
      aria-label={armed ? confirmName : undefined}
      data-confirming={armed ? "" : undefined}
      className={armed ? "py-1.5 pr-1.5" : undefined}
      onClick={armed ? onConfirm : arm}
    >
      {armed ? (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={transitions.fade}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {message}
          </span>
          <Button size="xs" variant="destructive" render={<span />}>
            {action}
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            tabIndex={-1}
            aria-label={m.common_cancel_button()}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              disarm()
            }}
          >
            <X strokeWidth={1.75} />
          </Button>
        </motion.span>
      ) : (
        <>
          <Icon strokeWidth={1.75} />
          {label}
        </>
      )}
    </DropdownMenuItem>
  )
}
