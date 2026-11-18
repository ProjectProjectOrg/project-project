import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@pp/shared"
import { SidebarPanelHeader } from "@pp/ui/sidebar"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { SprintStateIcon } from "@/features/sprints/components/SprintChip"
import { useActiveSprint } from "@/features/sprints/hooks/useActiveSprint"
import { m } from "@/paraglide/messages"

type OrgResult = Atom.Type<ReturnType<typeof orgDetail>>

const noOrg: Atom.Atom<OrgResult> = Atom.make(Result.initial())

// The sidebar header for the dashboard and every project, in SidebarPanel's
// header slot. It swaps at once; the breadcrumbs animate the change.
export function PanelHeader({
  orgSlug,
  project
}: Readonly<{ orgSlug: string | null; project: Project | undefined }>) {
  const active = useActiveSprint(orgSlug, project?.slug ?? null)
  const org = useAtomValue(
    orgSlug === null ? noOrg : orgDetail(orgRequest(orgSlug))
  )
  if (project === undefined)
    return (
      <SidebarPanelHeader
        title={m.chrome_sidebar_dashboard()}
        subtitle={
          Result.isSuccess(org) ? org.value.name : (orgSlug ?? undefined)
        }
      />
    )
  return (
    <SidebarPanelHeader
      title={project.name}
      subtitle={active?.label ?? project.key}
      subtitleIcon={
        active === null ? undefined : (
          <SprintStateIcon sprint={active.sprint} size="xs" />
        )
      }
    />
  )
}
