import type { User } from "@pp/shared"
import { useRouter } from "@tanstack/react-router"
import { Menu } from "lucide-react"
import { LayoutGroup } from "motion/react"
import { useEffect, useState } from "react"

import { SidebarContent } from "@/components/shell/Sidebar"
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
  const router = useRouter()

  useEffect(
    () =>
      router.subscribe("onResolved", ({ pathChanged, toLocation }) => {
        if (pathChanged && !toLocation.state.keepSidebarDrawer) setOpen(false)
      }),
    [router]
  )

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
        <LayoutGroup id="sidebar-drawer">
          <SidebarContent user={user} />
        </LayoutGroup>
      </SheetContent>
    </Sheet>
  )
}
