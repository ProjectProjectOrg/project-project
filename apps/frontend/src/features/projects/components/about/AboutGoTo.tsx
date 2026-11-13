import { Link } from "@tanstack/react-router"
import {
  CalendarRange,
  ListChecks,
  Settings,
  type LucideIcon
} from "lucide-react"
import type { ReactElement } from "react"

import { Button } from "@/components/ui/button"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { MetaRow } from "@/features/tickets/components/ticket-page/MetaRow"
import { m } from "@/paraglide/messages"

export function AboutGoTo() {
  const { orgSlug, slug } = useProjectRoute()
  const params = { orgSlug, slug }
  return (
    <MetaRow inset="link" label={m.project_about_goto_label()}>
      <GoToRow
        icon={ListChecks}
        label={m.project_detail_tab_backlog()}
        link={<Link to="/orgs/$orgSlug/projects/$slug" params={params} />}
      />
      <GoToRow
        icon={CalendarRange}
        label={m.project_detail_tab_sprints()}
        link={
          <Link to="/orgs/$orgSlug/projects/$slug/sprints" params={params} />
        }
      />
      <GoToRow
        icon={Settings}
        label={m.project_detail_tab_settings()}
        link={
          <Link to="/orgs/$orgSlug/projects/$slug/settings" params={params} />
        }
      />
    </MetaRow>
  )
}

function GoToRow({
  icon: Icon,
  label,
  link
}: Readonly<{ icon: LucideIcon; label: string; link: ReactElement }>) {
  return (
    <Button variant="sidebar-link" size="sm" className="w-full" render={link}>
      <span className="flex w-5 shrink-0">
        <Icon className="size-3.5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </Button>
  )
}
