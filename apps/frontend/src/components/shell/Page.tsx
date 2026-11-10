import type { HTMLAttributes } from "react"

import { cn } from "@/lib/utils"

export function PageContainer({
  className,
  width = "full",
  ...props
}: HTMLAttributes<HTMLDivElement> & Readonly<{ width?: "full" | "focused" }>) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-6",
        width === "focused" && "mx-auto max-w-[1020px]",
        className
      )}
      {...props}
    />
  )
}

export function PageHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-page-header
      className={cn(
        "flex flex-col gap-1 [&>h1]:text-display [&>h1]:font-bold [&>p]:text-body [&>p]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export function PageActionBar({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2", className)}
      {...props}
    />
  )
}
