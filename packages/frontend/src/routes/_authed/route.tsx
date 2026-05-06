import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import {
  createFileRoute,
  Link,
  Navigate,
  Outlet,
  useLocation
} from "@tanstack/react-router"
import { FolderKanban, LayoutDashboard, LogOut, UserRound } from "lucide-react"
import { logoutAtom, meAtom } from "@/atoms/auth"
import { Breadcrumbs } from "@/components/Breadcrumbs"
import { Logo, Wordmark } from "@/components/Logo"
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

import type { User } from "@projectproject/shared"
import type { LucideIcon } from "lucide-react"

export const Route = createFileRoute("/_authed")({ component: AuthedLayout })

function AuthedLayout() {
  const me = useAtomValue(meAtom)
  const { pathname } = useLocation()

  return Result.matchWithError(me, {
    onInitial: () => <FullPageStatus>Loading…</FullPageStatus>,
    onError: () => <Navigate to="/login" replace />,
    onDefect: (defect) => (
      <FullPageStatus>Something went wrong: {String(defect)}</FullPageStatus>
    ),
    onSuccess: ({ value }) => {
      // "/" with an active org → org dashboard; null org falls through to Shell (https://projectproject.missler.xyz/projects/project-project?ticket=T-35 will redirect to /onboarding).
      if (pathname === "/" && value.activeOrgSlug) {
        return (
          <Navigate
            to="/orgs/$orgSlug"
            params={{ orgSlug: value.activeOrgSlug }}
            replace
          />
        )
      }
      return <Shell user={value} />
    }
  })
}

function Shell({ user }: { user: User }) {
  return (
    <div className="h-full p-3">
      <div className="grid h-full grid-cols-[14rem_1fr] grid-rows-[3.5rem_1fr] overflow-hidden rounded-2xl bg-background shadow-sm ring-1 ring-border/60">
        <Sidebar user={user} />
        <Topbar user={user} />
        <main className="m-2 ml-0 mt-0 overflow-auto rounded-xl bg-muted/60">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function Sidebar({ user }: { user: User }) {
  const orgSlug = user.activeOrgSlug

  return (
    <aside className="row-span-2 flex flex-col">
      <div className="flex h-14 items-center gap-3 px-4 text-foreground">
        <Logo className="size-8" />
        <Wordmark className="h-5 w-auto" />
      </div>
      <nav className="flex flex-col gap-1 px-3 py-2">
        <NavItem to="/" icon={LayoutDashboard} label="Dashboard" exact />
        {orgSlug && (
          <NavItem
            to="/orgs/$orgSlug/projects"
            params={{ orgSlug }}
            icon={FolderKanban}
            label="Projects"
          />
        )}
      </nav>
      <div className="mt-auto p-3">
        <ThemeSwitcher />
      </div>
    </aside>
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
      <Breadcrumbs className="min-w-0 flex-1" />
      <UserMenu user={user} />
    </header>
  )
}

function UserMenu({ user }: { user: User }) {
  const logout = useAtomSet(logoutAtom)
  const initial = (user.name?.charAt(0) ?? user.email.charAt(0)).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open user menu"
          className="rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-9">
            {user.image ? <AvatarImage src={user.image} alt="" /> : null}
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
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
        <DropdownMenuItem asChild>
          <Link to="/profile" className="cursor-pointer">
            <UserRound className="size-4" strokeWidth={1.75} />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => logout()}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" strokeWidth={1.75} />
          Sign out
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
