import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { User } from "@pp/shared"
import { Link, useParams } from "@tanstack/react-router"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import {
  ChevronsUpDown,
  Copy,
  LogOut,
  MessageSquarePlus,
  Settings
} from "lucide-react"
import { useRef, useState } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { SegmentedTabs } from "@/components/ui/segmented-tabs"
import { logout } from "@/features/auth/atoms/auth"
import {
  FeedbackPopover,
  useFeedbackEnabled
} from "@/features/feedback/components/FeedbackPopover"
import { instanceHealth } from "@/features/instance/atoms/instance"
import { displayVersion } from "@/features/instance/lib/displayVersion"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { THEME_ITEMS, useTheme, type ThemePreference } from "@/hooks/useTheme"
import { m } from "@/paraglide/messages"

export function SidebarMenu({
  user,
  orgSlug
}: {
  user: User
  orgSlug: string | null
}) {
  const [open, setOpen] = useState(false)
  const signOut = useAtomSet(logout)
  const { preference, setPreference } = useTheme()
  const { slug } = useParams({ strict: false })
  const health = useAtomValue(instanceHealth)
  const version = AsyncResult.isSuccess(health) ? health.value.version : null

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          aria-label={m.chrome_user_menu_open()}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-body text-foreground transition-colors outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring data-[popup-open]:bg-hover"
        >
          <MemberAvatar member={user} size={20} />
          <span className="min-w-0 flex-1 truncate">{user.name}</span>
          <ChevronsUpDown
            className="size-3.5 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-(--anchor-width) min-w-64"
        >
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <MemberAvatar member={user} size={28} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-body text-foreground">
                {user.name}
              </span>
              <span className="truncate text-caption text-muted-foreground">
                {user.email}
              </span>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={
              orgSlug && slug ? (
                <Link
                  to="/orgs/$orgSlug/projects/$slug/settings"
                  params={{ orgSlug, slug }}
                />
              ) : orgSlug ? (
                <Link to="/orgs/$orgSlug/settings" params={{ orgSlug }} />
              ) : (
                <Link to="/profile/account" />
              )
            }
          >
            <Settings className="size-4" strokeWidth={1.75} />
            {m.chrome_sidebar_menu_settings()}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            closeOnClick={false}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                return
              event.preventDefault()
              setPreference(
                stepTheme(preference, event.key === "ArrowRight" ? 1 : -1)
              )
            }}
            className="justify-between py-1 pr-1"
          >
            <span>{m.theme_switcher_aria_label()}</span>
            <SegmentedTabs
              variant="rail"
              labels="none"
              focusable={false}
              aria-label={m.theme_switcher_aria_label()}
              value={preference}
              onValueChange={(next) => setPreference(next)}
              items={THEME_ITEMS}
            />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {orgSlug ? (
            <FeedbackItem orgSlug={orgSlug} onDone={() => setOpen(false)} />
          ) : null}
          {version ? (
            <DropdownMenuItem
              onClick={() => void navigator.clipboard.writeText(version)}
              className="items-start py-[5px]"
            >
              <Copy className="mt-0.5 size-4" strokeWidth={1.75} />
              <span className="flex min-w-0 flex-col">
                {m.chrome_sidebar_copy_version()}
                <span className="truncate font-mono text-caption text-muted-foreground">
                  {displayVersion(version)}
                </span>
              </span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut()} variant="destructive">
            <LogOut className="size-4" strokeWidth={1.75} />
            {m.chrome_user_menu_sign_out()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

function stepTheme(current: ThemePreference, step: 1 | -1): ThemePreference {
  const index = THEME_ITEMS.findIndex((item) => item.key === current)
  const next = (index + step + THEME_ITEMS.length) % THEME_ITEMS.length
  return THEME_ITEMS[next].key
}

function FeedbackItem({
  orgSlug,
  onDone
}: {
  orgSlug: string
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const itemRef = useRef<HTMLDivElement>(null)
  if (!useFeedbackEnabled(orgSlug)) return null
  return (
    <>
      <DropdownMenuItem
        ref={itemRef}
        closeOnClick={false}
        onClick={() => setOpen(true)}
      >
        <MessageSquarePlus className="size-4" strokeWidth={1.75} />
        {m.feedback_open()}
      </DropdownMenuItem>
      <FeedbackPopover
        orgSlug={orgSlug}
        open={open}
        onOpenChange={setOpen}
        onDone={onDone}
        anchor={itemRef}
      />
    </>
  )
}
