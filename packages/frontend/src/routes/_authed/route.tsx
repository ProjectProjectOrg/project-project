import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import {
  createFileRoute,
  Link,
  Navigate,
  Outlet,
  useLocation
} from "@tanstack/react-router"
import { FolderKanban, LayoutDashboard, LogOut, UserRound } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { logoutAtom, meAtom } from "@/atoms/auth"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { Logo, Wordmark } from "@/components/Logo"
import {
  SidebarSlotProvider,
  useSidebarSectionContent,
  useSidebarSlotContent
} from "@/components/SidebarSlot"
import { ThemeSwitcher } from "@/components/ThemeSwitcher"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import type { User } from "@projectproject/shared"
import type { LucideIcon } from "lucide-react"

export const Route = createFileRoute("/_authed")({ component: AuthedLayout })

function AuthedLayout() {
  const me = useAtomValue(meAtom)
  const { pathname } = useLocation()

  return Result.matchWithError(me, {
    onInitial: () => <FullPageStatus>{m.chrome_loading()}</FullPageStatus>,
    onError: () => <Navigate to="/login" replace />,
    onDefect: (defect) => (
      <FullPageStatus>
        {m.chrome_defect({ defect: String(defect) })}
      </FullPageStatus>
    ),
    onSuccess: ({ value }) => {
      if (pathname === "/" && value.activeOrgSlug) {
        return (
          <Navigate
            to="/orgs/$orgSlug"
            params={{ orgSlug: value.activeOrgSlug }}
            replace
          />
        )
      }
      return (
        <SidebarSlotProvider>
          <Shell user={value} />
        </SidebarSlotProvider>
      )
    }
  })
}

function Shell({ user }: { user: User }) {
  return (
    <div className="h-full p-3">
      <div className="grid h-full grid-cols-[14rem_1fr] grid-rows-[3.5rem_1fr] overflow-hidden rounded-2xl bg-background shadow-sm ring-1 ring-border/60">
        <Sidebar user={user} />
        <Topbar user={user} />
        <main className="flex min-h-0 overflow-hidden p-2 pt-0">
          <div className="min-w-0 flex-1 overflow-auto rounded-xl bg-muted/60 [scrollbar-gutter:stable]">
            <div className="p-6">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function Sidebar({ user }: { user: User }) {
  const orgSlug = user.activeOrgSlug
  const slot = useSidebarSlotContent()
  const section = useSidebarSectionContent()
  const reduceMotion = useReducedMotion()
  const railScale = reduceMotion ? 1 : 1.02
  const navScale = reduceMotion ? 1 : 0.98

  return (
    <aside className="row-span-2 flex flex-col">
      <div className="flex h-14 items-center gap-3 px-4 text-foreground">
        <Logo className="size-8" />
        <Wordmark className="h-5 w-auto" />
      </div>
      <div className="relative min-h-0 flex-1">
        <AnimatePresence initial={false} mode="popLayout">
          {slot ? (
            <motion.div
              key="rail"
              initial={{ opacity: 0, scale: railScale }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: railScale, pointerEvents: "none" }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className="absolute inset-0 overflow-y-auto px-3 py-2 will-change-transform"
            >
              {slot}
            </motion.div>
          ) : (
            <motion.div
              key="nav"
              initial={{ opacity: 0, scale: navScale }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: navScale, pointerEvents: "none" }}
              transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
              className="absolute inset-0 overflow-y-auto will-change-transform"
            >
              <PrimaryNav orgSlug={orgSlug} />
              <AnimatePresence initial={false}>
                {section ? (
                  <motion.div
                    key="section"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                  >
                    {section}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="p-3">
        <ThemeSwitcher />
      </div>
    </aside>
  )
}

function PrimaryNav({ orgSlug }: { orgSlug: string | null }) {
  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      {orgSlug ? (
        <NavItem
          to="/orgs/$orgSlug"
          params={{ orgSlug }}
          icon={LayoutDashboard}
          label={m.chrome_sidebar_dashboard()}
          exact
        />
      ) : (
        <NavItem
          to="/"
          icon={LayoutDashboard}
          label={m.chrome_sidebar_dashboard()}
          exact
        />
      )}
      {orgSlug && (
        <NavItem
          to="/orgs/$orgSlug/projects"
          params={{ orgSlug }}
          icon={FolderKanban}
          label={m.chrome_sidebar_projects()}
        />
      )}
    </nav>
  )
}

type NavItemProps =
  | {
      to: "/"
      icon: LucideIcon
      label: string
      exact?: boolean
      params?: undefined
    }
  | {
      to: "/orgs/$orgSlug/projects"
      params: { orgSlug: string }
      icon: LucideIcon
      label: string
      exact?: boolean
    }
  | {
      to: "/orgs/$orgSlug"
      params: { orgSlug: string }
      icon: LucideIcon
      label: string
      exact?: boolean
    }

function NavItem({ to, params, icon: Icon, label, exact }: NavItemProps) {
  const base =
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors"
  return (
    <Link
      to={to}
      params={params as never}
      activeOptions={{ exact: exact ?? false }}
      className={cn(
        base,
        "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      )}
      activeProps={{
        className: cn(base, "bg-accent text-foreground font-medium")
      }}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      <span>{label}</span>
    </Link>
  )
}

function Topbar({ user }: { user: User }) {
  return (
    <header className="flex h-14 items-center gap-2 px-4">
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>
      <UserMenu user={user} />
    </header>
  )
}

function UserMenu({ user }: { user: User }) {
  const logout = useAtomSet(logoutAtom)
  const initial = (user.name?.charAt(0) ?? user.email.charAt(0)).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={m.chrome_user_menu_open()}
            className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar className="size-9">
              {user.image ? <AvatarImage src={user.image} alt="" /> : null}
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <div className="flex items-center gap-3 p-2">
          <Avatar className="size-10">
            {user.image ? <AvatarImage src={user.image} alt="" /> : null}
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {user.email}
            </div>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={
            <Link to="/profile" className="cursor-pointer">
              <UserRound className="size-4" strokeWidth={1.75} />
              {m.chrome_user_menu_profile()}
            </Link>
          }
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => logout()}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" strokeWidth={1.75} />
          {m.chrome_user_menu_sign_out()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FullPageStatus({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
