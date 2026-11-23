import { useAtomValue } from "@effect/atom-react"
import type { User } from "@pp/shared"
import {
  Navigate,
  Outlet,
  useLocation,
  useParams
} from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { motion } from "motion/react"
import { useState } from "react"

import { Breadcrumbs } from "@/components/shell/Breadcrumbs"
import { ErrorPage } from "@/components/shell/ErrorPage"
import { LoaderOverlay } from "@/components/shell/LoaderOverlay"
import { MobileNav } from "@/components/shell/MobileNav"
import { Sidebar } from "@/components/shell/sidebar/Sidebar"
import { me } from "@/features/auth/atoms/auth"
import { authedRouteRedirect } from "@/features/auth/lib/authRedirect"
import { CommandMenuHost } from "@/features/command-menu/components/CommandMenuHost"
import { RunningTimerIndicator } from "@/features/everhour/components/RunningTimerIndicator"
import { TicketPreviewRoot } from "@/features/tickets/components/ticket-preview/TicketPreview"
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
        <Shell
          key={orgSlug ?? value.activeOrgSlug}
          user={{ ...value, activeOrgSlug: orgSlug ?? value.activeOrgSlug }}
        />
      )
    }
  })
}

function Shell({ user }: { user: User }) {
  const [backdrop, setBackdrop] = useState<HTMLDivElement | null>(null)
  return (
    <div className="h-full">
      <div className="grid h-full grid-cols-1 grid-rows-[3.5rem_1fr] overflow-hidden bg-background lg:grid-cols-[auto_minmax(0,1fr)] lg:grid-rows-1">
        <Sidebar user={user} />
        <Topbar user={user} />
        {/* Next to the sidebar the page takes no left margin: the panel's own
            8px inset is the gap, so its rows and card sit as far from the
            page as from the rail. */}
        <main className="flex min-h-0 overflow-hidden p-2 pt-0 lg:pt-2 lg:pl-0">
          <div className="relative isolate flex min-w-0 flex-1 overflow-hidden rounded-xl bg-page">
            <PageBackdropContext value={backdrop}>
              {/* layoutScroll: layout animations inside measure against the
                  page, not the viewport, so the scroll reset on navigation
                  doesn't fly them in from where the page used to be. */}
              <motion.div
                layoutScroll
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
                  className="flex min-h-full flex-col p-6 pt-3"
                >
                  <PageBar user={user} />
                  <Outlet />
                </div>
                <div data-scroll-spacer aria-hidden />
              </motion.div>
            </PageBackdropContext>
          </div>
        </main>
      </div>
      {user.activeOrgSlug ? (
        <CommandMenuHost orgSlug={user.activeOrgSlug} />
      ) : null}
      <TicketPreviewRoot />
    </div>
  )
}

// Phones only: the menu button and the timer. On desktop the sidebar spans
// the full height and the page bar inside the container carries both.
function Topbar({ user }: { user: User }) {
  return (
    <header className="flex h-14 items-center gap-2 px-4 lg:hidden">
      <MobileNav user={user} />
      <div className="flex-1" />
      {user.activeOrgSlug ? (
        <RunningTimerIndicator orgSlug={user.activeOrgSlug} />
      ) : null}
    </header>
  )
}

// The breadcrumbs, at the top of the page container so they scroll with
// it and sit on its banner.
function PageBar({ user }: { user: User }) {
  return (
    <div className="mb-3 flex min-h-8 items-center gap-2">
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>
      {user.activeOrgSlug ? (
        <div className="hidden lg:block">
          <RunningTimerIndicator orgSlug={user.activeOrgSlug} />
        </div>
      ) : null}
    </div>
  )
}
