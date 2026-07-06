import { Link, type LinkComponentProps } from "@tanstack/react-router"
import { ChevronLeft } from "lucide-react"
import { useSuppressSidebarAutoClose } from "@/components/SidebarSlot"
import { cn } from "@/lib/utils"

type RailBackLinkProps = LinkComponentProps & {
  label: string
}

export function RailBackLink({
  label,
  className,
  onClick,
  ...linkProps
}: RailBackLinkProps) {
  const suppressAutoClose = useSuppressSidebarAutoClose()
  return (
    <Link
      {...linkProps}
      onClick={(event) => {
        suppressAutoClose?.()
        onClick?.(event)
      }}
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
