import { cn } from "@/lib/utils"
import type { HTMLAttributes } from "react"

export function PageContainer({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex w-full flex-col gap-6", className)} {...props} />
  )
}

export function PageHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 [&>h1]:text-2xl [&>h1]:font-semibold [&>h1]:tracking-tight [&>p]:text-sm [&>p]:text-muted-foreground",
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
