import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@pp/shared"
import { Inbox, LayoutDashboard, LayoutGrid, Settings } from "@pp/ui/icons"
import { SidebarPanelBody, SidebarRow } from "@pp/ui/sidebar"
import { TextSwap } from "@pp/ui/text-swap"
import { Link } from "@tanstack/react-router"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import {
  inboxCountRequest,
  unreadInboxCount
} from "@/features/inbox/atoms/inbox"
import { useInboxCountPolling } from "@/features/inbox/hooks/useInboxPolling"
import { DashboardPins } from "@/features/pins/components/DashboardPins"
import { useOrgActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

export function DashboardPanel({
  orgSlug,
  page,
  projects
}: Readonly<{
  orgSlug: string | null
  page: "overview" | "inbox" | "projects" | null
  projects: ReadonlyArray<Project>
}>) {
  return (
    <>
      {orgSlug === null ? null : (
        <SidebarPanelBody label={m.chrome_sidebar_dashboard()}>
          <SidebarRow
            icon={<LayoutDashboard />}
            label={m.chrome_sidebar_overview()}
            active={page === "overview"}
            render={
              <Link
                activeOptions={{ exact: true, includeSearch: false }}
                to="/orgs/$orgSlug"
                params={{ orgSlug }}
              />
            }
          />
          <InboxRow orgSlug={orgSlug} active={page === "inbox"} />
          <SidebarRow
            icon={<LayoutGrid />}
            label={m.chrome_sidebar_all_projects()}
            active={page === "projects"}
            render={
              <Link
                activeOptions={{ exact: true, includeSearch: false }}
                to="/orgs/$orgSlug/projects"
                params={{ orgSlug }}
              />
            }
          />
          <OrgSettingsRow orgSlug={orgSlug} />
          <DashboardPins orgSlug={orgSlug} projects={projects} />
        </SidebarPanelBody>
      )}
    </>
  )
}

function InboxRow({
  orgSlug,
  active
}: Readonly<{ orgSlug: string; active: boolean }>) {
  useInboxCountPolling(orgSlug)
  const result = useAtomValue(unreadInboxCount(inboxCountRequest(orgSlug)))
  const unread = AsyncResult.isSuccess(result) ? result.value : 0
  return (
    <SidebarRow
      icon={<Inbox />}
      label={m.chrome_sidebar_inbox()}
      active={active}
      meta={
        unread === 0 ? null : <TextSwap speed="fast">{String(unread)}</TextSwap>
      }
      render={
        <Link
          activeOptions={{ exact: true, includeSearch: false }}
          to="/orgs/$orgSlug/inbox"
          params={{ orgSlug }}
        />
      }
    />
  )
}

function OrgSettingsRow({ orgSlug }: Readonly<{ orgSlug: string }>) {
  if (!useOrgActor(orgSlug).call("org", "rename")) return null
  return (
    <SidebarRow
      icon={<Settings />}
      label={m.chrome_sidebar_menu_settings()}
      submenu
      render={
        <Link
          activeOptions={{ exact: true, includeSearch: false }}
          to="/settings/orgs/$orgSlug"
          params={{ orgSlug }}
        />
      }
    />
  )
}
