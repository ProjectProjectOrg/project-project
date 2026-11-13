import {
  Link,
  useCanGoBack,
  useRouter,
  type LinkComponentProps
} from "@tanstack/react-router"
import { ChevronLeft } from "lucide-react"
import type { MouseEvent } from "react"

import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

type BackButtonProps = {
  fallback: LinkComponentProps
  label?: string
  className?: string
}

export function BackButton({ fallback, label, className }: BackButtonProps) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const fallbackOnClick = fallback.onClick

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    fallbackOnClick?.(e)
    if (e.defaultPrevented) return
    if (!canGoBack) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return
    }
    e.preventDefault()
    router.history.back()
  }

  return (
    <Button
      variant="chip-muted"
      className={className}
      render={<Link {...fallback} onClick={handleClick} />}
    >
      <ChevronLeft className="size-4" strokeWidth={1.75} />
      <span>{label ?? m.common_back_button()}</span>
    </Button>
  )
}
