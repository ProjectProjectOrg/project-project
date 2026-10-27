import { useAtomValue } from "@effect/atom-react"
import type { User } from "@pp/shared"
import {
  Navigate,
  Outlet,
  useLocation,
  useParams
} from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

import { Breadcrumbs } from "@/components/shell/Breadcrumbs"
import { ErrorPage } from "@/components/shell/ErrorPage"
import { LoaderOverlay } from "@/components/shell/LoaderOverlay"
import { MobileNav } from "@/components/shell/MobileNav"
import { Sidebar } from "@/components/shell/Sidebar"
import { SidebarSlotProvider } from "@/components/shell/SidebarSlot"
import { UserMenu } from "@/components/shell/UserMenu"
import { me } from "@/features/auth/atoms/auth"
import { authedRouteRedirect } from "@/features/auth/lib/authRedirect"
import { RunningTimerIndicator } from "@/features/everhour/components/RunningTimerIndicator"
import { PageBackdropContext } from "@/lib/pageBackdrop"

export function AuthedLayout() {
  const viewer = useAtomValue(me())
  const { pathname } = useLocation()
  const { orgSlug } = useParams({ strict: false })

  return Result.matchWithError(viewer, {
    onInitial: () => <LoaderOverlay active />,
    onError: () => <Navigate to="/login" replace />,
    onDefect: (defect) => <ErrorPage error={defect} />,
    onSuccess: ({ value }) => {
      const redirect = authedRouteRedirect(pathname, value.activeOrgSlug)
      if (redirect?.to === "/welcome") {
        return <Navigate to="/welcome" replace />
      }
      if (redirect) {
        return <Navigate to="/orgs/$orgSlug" params={redirect.params} replace />
      }
      return (
        <SidebarSlotProvider key={orgSlug ?? value.activeOrgSlug}>
          <Shell
            user={{ ...value, activeOrgSlug: orgSlug ?? value.activeOrgSlug }}
          />
        </SidebarSlotProvider>
      )
    }
  })
}

function Shell({ user }: { user: User }) {
  const [backdrop, setBackdrop] = useState<HTMLDivElement | null>(null)
  return (
    <div className="h-full transition-[padding] duration-300 ease-out motion-reduce:transition-none lg:p-3">
      <div className="grid h-full grid-cols-1 grid-rows-[3.5rem_1fr] overflow-hidden bg-background transition-[border-radius,box-shadow] duration-300 ease-out motion-reduce:transition-none lg:grid-cols-[14rem_1fr] lg:rounded-2xl lg:shadow-sm lg:ring-1 lg:ring-border/60">
        <Sidebar user={user} />
        <Topbar user={user} />
        <main className="flex min-h-0 overflow-hidden p-2 pt-0">
          <div className="relative isolate flex min-w-0 flex-1 overflow-hidden rounded-xl bg-muted/60">
            <PageBackdropContext value={backdrop}>
              <div
                data-scroll-root
                className="relative isolate min-w-0 flex-1 [scrollbar-gutter:stable] overflow-auto overscroll-y-none"
              >
                <div
                  ref={setBackdrop}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 -z-10"
                />
                <div
                  data-scroll-content
                  className="flex min-h-full flex-col p-6"
                >
                  <Outlet />
                </div>
                <div data-scroll-spacer aria-hidden />
              </div>
            </PageBackdropContext>
          </div>
        </main>
      </div>
    </div>
  )
}

function Topbar({ user }: { user: User }) {
  return (
    <header className="flex h-14 items-center gap-2 px-4">
      <MobileNav user={user} />
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>
      {user.activeOrgSlug ? (
        <RunningTimerIndicator orgSlug={user.activeOrgSlug} />
      ) : null}
      <UserMenu user={user} />
    </header>
  )
}
