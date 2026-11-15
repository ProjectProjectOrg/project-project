import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { LogOut, Settings, UserRound } from "@pp/ui/icons"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { useState } from "react"

const USER = { id: "user_ada", name: "Ada Visser", email: "ada@example.com" }

const USER_TOGGLES = new Set(["trigger-press", "escape-key"])

export default function UserMenu() {
  const [open, setOpen] = useState(true)

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next, details) => {
        if (USER_TOGGLES.has(details.reason)) setOpen(next)
      }}
      modal={false}
    >
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Open user menu"
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        }
      >
        <MemberAvatar member={USER} size={36} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-64">
        <div className="flex items-center gap-3 p-2">
          <MemberAvatar member={USER} size={40} />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-body font-semibold">{USER.name}</div>
            <div className="truncate text-caption text-muted-foreground">
              {USER.email}
            </div>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <UserRound className="size-4" strokeWidth={1.75} />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="size-4" strokeWidth={1.75} />
          Organization settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <LogOut className="size-4" strokeWidth={1.75} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
