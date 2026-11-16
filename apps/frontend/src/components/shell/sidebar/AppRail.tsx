import type { Project, User } from "@pp/shared"
import { LayoutDashboard, Plus, Search } from "@pp/ui/icons"
import { KbdShortcut } from "@pp/ui/kbd"
import { Logo } from "@pp/ui/logo"
import {
  SidebarRail,
  SidebarRailItem,
  SidebarRailSeparator
} from "@pp/ui/sidebar"
import { Link } from "@tanstack/react-router"

import { AccountMenu } from "@/components/shell/sidebar/AccountMenu"
import {
  PROJECT_PAGE_PATHS,
  type SidebarScope
} from "@/components/shell/sidebar/sidebarRoute"
import { useOpenCommandMenu } from "@/features/command-menu/hooks/useOpenCommandMenu"
import { OrgSwitcher } from "@/features/organizations/components/OrgSwitcher"
import { ProjectIconTile } from "@/features/projects/components/ProjectIconTile"
import { PROJECT_SETTINGS_SECTIONS } from "@/features/projects/lib/projectSettingsSections"
import { useOrgActor } from "@/hooks/useActor"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

export function AppRail({
  user,
  orgSlug,
  scope,
  projects
}: Readonly<{
  user: User
  orgSlug: string | null
  scope: SidebarScope
  projects: ReadonlyArray<Project>
}>) {
  return (
    <SidebarRail
      label={m.chrome_sidebar_rail_label()}
      top={
        <OrgSwitcher
          trigger={
            <SidebarRailItem label={m.org_switcher_trigger_aria_label()}>
              <Logo className="size-[22px]" />
            </SidebarRailItem>
          }
        />
      }
      bottom={
        <>
          {orgSlug === null ? null : <SearchItem orgSlug={orgSlug} />}
          <AccountMenu user={user} orgSlug={orgSlug} />
        </>
      }
    >
      <SidebarRailItem
        label={m.chrome_sidebar_dashboard()}
        active={scope.kind === "dashboard"}
        render={
          orgSlug === null ? (
            <Link
              activeOptions={{ exact: true, includeSearch: false }}
              to="/"
            />
          ) : (
            <Link
              activeOptions={{ exact: true, includeSearch: false }}
              to="/orgs/$orgSlug"
              params={{ orgSlug }}
            />
          )
        }
      >
        <LayoutDashboard />
      </SidebarRailItem>
      {orgSlug === null ? null : (
        <>
          {projects.length > 0 ? <SidebarRailSeparator /> : null}
          {projects.map((project) => (
            <ProjectTile
              key={project.slug}
              orgSlug={orgSlug}
              project={project}
              scope={scope}
            />
          ))}
          <NewProjectItem orgSlug={orgSlug} />
        </>
      )}
    </SidebarRail>
  )
}

function ProjectTile({
  orgSlug,
  project,
  scope
}: Readonly<{ orgSlug: string; project: Project; scope: SidebarScope }>) {
  const params = { orgSlug, slug: project.slug }
  const route = scope.kind === "project" ? scope.route : null
  const settingsSection =
    route?.page === "settings"
      ? PROJECT_SETTINGS_SECTIONS.find((section) => section.key === route.sub)
      : undefined
  return (
    <SidebarRailItem
      label={project.name}
      tone={project.color}
      active={scope.kind === "project" && scope.slug === project.slug}
      render={
        settingsSection === undefined ? (
          <Link
            activeOptions={{ exact: true, includeSearch: false }}
            to={PROJECT_PAGE_PATHS[route?.page ?? "backlog"]}
            params={params}
          />
        ) : (
          <Link
            activeOptions={{ exact: true, includeSearch: false }}
            to={`/orgs/$orgSlug/projects/$slug/settings/${settingsSection.key}`}
            params={params}
          />
        )
      }
    >
      <ProjectIconTile
        orgSlug={orgSlug}
        icon={project.icon}
        iconImage={project.iconImage}
        color={project.color}
        size="rail"
        seed={project.slug}
        className="rounded-[inherit]! shadow-none [corner-shape:inherit]"
      />
    </SidebarRailItem>
  )
}

function NewProjectItem({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const open = useOpenCommandMenu(orgSlug)
  if (!useOrgActor(orgSlug).call("projects", "create")) return null
  return (
    <SidebarRailItem
      label={m.chrome_sidebar_new_project()}
      onClick={() => open("createProject")}
    >
      <Plus />
    </SidebarRailItem>
  )
}

function SearchItem({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const open = useOpenCommandMenu(orgSlug)
  return (
    <SidebarRailItem
      label={m.chrome_sidebar_search()}
      tooltip={
        <span className="flex items-center gap-2">
          {m.chrome_sidebar_search()}
          <KbdShortcut size="sm" keys="mod+k" keyLabels={keyLabels()} />
        </span>
      }
      onClick={() => open()}
    >
      <Search />
    </SidebarRailItem>
  )
}
