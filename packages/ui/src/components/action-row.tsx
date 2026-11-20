import type { ComponentProps, ReactNode } from "react"

import { cn } from "../lib/utils"
import { Reveal } from "./reveal"

/*
 * ActionRow: a row link or button with one trailing action over its end,
 * like a ticket relation with its remove ✕.
 *
 *   <ActionRow action={<Button variant="ghost" size="square-7">✕</Button>}>
 *     <Button variant="ghost" render={<Link … />}>…</Button>
 *   </ActionRow>
 *
 * The row's Button leaves room at its end for the action, stays lit while
 * the action is hovered, and the action is revealed with the row.
 */
export function ActionRow({
  action,
  className,
  children,
  ...props
}: ComponentProps<"div"> & Readonly<{ action?: ReactNode }>) {
  return (
    <div
      data-slot="action-row"
      className={cn(
        "group/reveal relative flex max-w-full min-w-0 items-center",
        "hover:[&>[data-slot=button]]:bg-hover",
        action != null && "[&>[data-slot=button]]:pr-9",
        className
      )}
      {...props}
    >
      {children}
      {action != null && <Reveal className="absolute right-1">{action}</Reveal>}
    </div>
  )
}
