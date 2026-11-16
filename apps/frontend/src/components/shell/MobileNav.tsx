import type { User } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Menu } from "@pp/ui/icons"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@pp/ui/sheet"
import { useRouter } from "@tanstack/react-router"
import { LayoutGroup } from "motion/react"
import { useEffect, useState } from "react"

import { SidebarContent } from "@/components/shell/Sidebar"
import { m } from "@/paraglide/messages"

export function MobileNav({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(
    () =>
      router.subscribe("onResolved", ({ pathChanged }) => {
        if (pathChanged) setOpen(false)
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
            variant="ghost"
            size="square-9"
            aria-label={m.chrome_nav_open()}
            className="lg:hidden"
          >
            <Menu className="size-5" strokeWidth={1.75} />
          </Button>
        }
      />
      <SheetContent side="left">
        <SheetTitle className="sr-only">{m.chrome_nav_menu_title()}</SheetTitle>
        <LayoutGroup id="sidebar-drawer">
          <SidebarContent user={user} />
        </LayoutGroup>
      </SheetContent>
    </Sheet>
  )
}
