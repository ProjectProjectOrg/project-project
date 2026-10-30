import { useAtomSet } from "@effect/atom-react"
import type { User } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { LogOut, Settings, UserRound } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { logout } from "@/features/auth/atoms/auth"
import { InstanceInfo } from "@/features/instance/components/InstanceInfo"
import { m } from "@/paraglide/messages"

export function UserMenu({ user }: { user: User }) {
  const signOut = useAtomSet(logout)
  const initial = (user.name?.charAt(0) ?? user.email.charAt(0)).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={m.chrome_user_menu_open()}
            className="rounded-full ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        {user.activeOrgSlug ? (
          <DropdownMenuItem
            render={
              <Link
                to="/orgs/$orgSlug/settings"
                params={{ orgSlug: user.activeOrgSlug }}
                className="cursor-pointer"
              >
                <Settings className="size-4" strokeWidth={1.75} />
                {m.org_settings_menu_item()}
              </Link>
            }
          />
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()} variant="destructive">
          <LogOut className="size-4" strokeWidth={1.75} />
          {m.chrome_user_menu_sign_out()}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <InstanceInfo />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
