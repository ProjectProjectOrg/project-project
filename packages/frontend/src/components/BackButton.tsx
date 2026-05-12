import {
  Link,
  useCanGoBack,
  useRouter,
  type LinkComponentProps
} from "@tanstack/react-router"
import { ChevronLeft } from "lucide-react"
import type { MouseEvent } from "react"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type BackButtonProps = {
  fallback: LinkComponentProps<"a">
  label?: string
  className?: string
}

export function BackButton({ fallback, label, className }: BackButtonProps) {
  const router = useRouter()
  const canGoBack = useCanGoBack()

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!canGoBack) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return
    }
    e.preventDefault()
    router.history.back()
  }

  return (
    <Link
      {...fallback}
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-2 text-[13px] text-muted-foreground transition-all duration-100 hover:bg-accent/40 hover:text-foreground active:scale-[0.97]",
        className
      )}
    >
      <ChevronLeft className="size-4" strokeWidth={1.75} />
      <span>{label ?? m.common_back_button()}</span>
    </Link>
  )
}
