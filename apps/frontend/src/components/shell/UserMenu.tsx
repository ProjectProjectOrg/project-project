import { useAtomSet } from "@effect/atom-react"
import type { User } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { LogOut, Settings, UserRound } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { logout } from "@/features/auth/atoms/auth"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { m } from "@/paraglide/messages"

export function UserMenu({ user }: { user: User }) {
  const signOut = useAtomSet(logout)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={m.chrome_user_menu_open()}
            className="rounded-full ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MemberAvatar member={user} size={36} />
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <div className="flex items-center gap-3 p-2">
          <MemberAvatar member={user} size={40} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-body font-semibold">{user.name}</div>
            <div className="truncate text-caption text-muted-foreground">
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
