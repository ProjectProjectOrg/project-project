import type { User } from "@pp/shared"
import { useLocation } from "@tanstack/react-router"
import { Menu } from "lucide-react"
import { LayoutGroup } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { SidebarContent } from "@/components/shell/Sidebar"
import { SidebarDrawerAutoCloseProvider } from "@/components/shell/SidebarSlot"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet"
import { m } from "@/paraglide/messages"

export function MobileNav({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const skipNextAutoClose = useRef(false)
  const suppressAutoClose = useCallback(() => {
    skipNextAutoClose.current = true
  }, [])

  useEffect(() => {
    if (skipNextAutoClose.current) {
      skipNextAutoClose.current = false
      return
    }
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="quiet"
            size="square-9"
            aria-label={m.chrome_nav_open()}
            className="lg:hidden"
          >
            <Menu className="size-5" strokeWidth={1.75} />
          </Button>
        }
      />
      <SheetContent side="left" showCloseButton={false}>
        <SheetTitle className="sr-only">{m.chrome_nav_menu_title()}</SheetTitle>
        <SidebarDrawerAutoCloseProvider value={suppressAutoClose}>
          <LayoutGroup id="sidebar-drawer">
            <SidebarContent user={user} />
          </LayoutGroup>
        </SidebarDrawerAutoCloseProvider>
      </SheetContent>
    </Sheet>
  )
}
