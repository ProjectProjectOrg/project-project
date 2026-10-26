import { motion } from "motion/react"
import type { ReactElement, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { transitions } from "@/lib/springs"

const OVERLAY_REVEAL =
  "invisible opacity-0 transition-opacity group-focus-within/editing:visible group-hover/hitbox:opacity-100 group-focus-within/hitbox:opacity-100"

export function NodeOverlayAction({
  morphId,
  slot,
  label,
  variant,
  onClick,
  render,
  children
}: Readonly<{
  morphId?: string
  slot: string
  label: string
  variant: "overlay" | "overlay-destructive"
  onClick?: () => void
  render?: ReactElement
  children: ReactNode
}>) {
  const button = (
    <Button
      variant={variant}
      size="icon-sm"
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={OVERLAY_REVEAL}
      render={render}
    >
      {children}
    </Button>
  )
  if (morphId === undefined) return <span className={slot}>{button}</span>
  return (
    <motion.span
      layoutId={morphId}
      layout="position"
      transition={transitions.morph}
      className={slot}
    >
      {button}
    </motion.span>
  )
}
