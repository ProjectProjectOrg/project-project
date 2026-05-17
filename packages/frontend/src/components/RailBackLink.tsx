import { Link, type LinkComponentProps } from "@tanstack/react-router"
import { ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

type RailBackLinkProps = LinkComponentProps & {
  label: string
}

export function RailBackLink({
  label,
  className,
  ...linkProps
}: RailBackLinkProps) {
  return (
    <Link
      {...linkProps}
      className={cn(
        "group/rail-back flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] leading-none text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
    >
      <ChevronLeft className="size-3.5" strokeWidth={1.75} />
      <span>{label}</span>
    </Link>
  )
}
