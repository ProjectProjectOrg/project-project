import type { ComponentProps } from "react"

import { splitForMiddleTruncate } from "@/lib/middleTruncate"
import { cn } from "@/lib/utils"

export function MiddleTruncate({
  value,
  tail,
  className,
  ...props
}: Omit<ComponentProps<"span">, "children"> &
  Readonly<{ value: string; tail?: number }>) {
  const split = splitForMiddleTruncate(value, tail)
  return (
    <span
      title={value}
      className={cn(
        "inline-flex max-w-full min-w-0 overflow-hidden whitespace-nowrap",
        className
      )}
      {...props}
    >
      {split === null ? (
        <span className="min-w-0 truncate">{value}</span>
      ) : (
        <>
          <span className="min-w-0 truncate">{split.head}</span>
          <span className="shrink-0">{split.tail}</span>
        </>
      )}
    </span>
  )
}
