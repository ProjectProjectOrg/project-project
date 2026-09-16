import * as Result from "effect/unstable/reactivity/AsyncResult"
import { meAtom } from "@/atoms/auth"
import { useAtomValue } from "@effect/atom-react"
import { useCallback } from "react"
import type { Ticket, TicketListQuery } from "@projectproject/shared"
import { TicketList } from "@/components/TicketList"
import { BacklogToolbar } from "@/components/TicketList/toolbars"
import { ArchiveTicketControl } from "@/components/TicketList/ArchiveControl"
import { PageContainer } from "@/components/page"
import { projectKey, sprintMembershipAtom } from "@/atoms/sprints"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"
import { useLocalStorageState } from "@/hooks/useLocalStorageState"
import * as Schema from "effect/Schema"
import { BacklogGroupingControl } from "./BacklogGroupingControl"
import { SprintSections } from "./SprintSections"

const GroupingSchema = Schema.Literals(["status", "sprint"])

export function BacklogView({
  orgSlug,
  slug,
  query,
  onQueryChange
}: {
  orgSlug: string
  slug: string
  query: TicketListQuery
  onQueryChange: (query: TicketListQuery) => void
}) {
  const project = useProject()
  const me = useAtomValue(meAtom)
  const viewerId = Result.isSuccess(me) ? me.value.id : ""
  const preferencesKey = `${viewerId}:${orgSlug}/${slug}`
  const [grouping, setGrouping] = useLocalStorageState(
    `projectproject:backlog-grouping:${preferencesKey}`,
    GroupingSchema,
    "status"
  )
  const sprintMembership = useAtomValue(
    sprintMembershipAtom(projectKey(orgSlug, slug))
  )
  const rowActions = useCallback(
    (ticket: Ticket) => (
      <ArchiveTicketControl
        orgSlug={orgSlug}
        slug={slug}
        id={ticket.id}
        archived={ticket.archivedAt !== null}
      />
    ),
    [orgSlug, slug]
  )
  return (
    <PageContainer>
      <TicketList
        orgSlug={orgSlug}
        slug={slug}
        query={query}
        members={project.members}
        sprintMembership={sprintMembership}
        toolbar={
          <BacklogToolbar
            onQueryChange={onQueryChange}
            orgSlug={orgSlug}
            slug={slug}
            query={query}
            members={project.members}
          >
            <BacklogGroupingControl value={grouping} onChange={setGrouping} />
          </BacklogToolbar>
        }
        extraRowActions={rowActions}
        sections={
          grouping === "sprint" ? (
            <SprintSections
              key={preferencesKey}
              preferencesKey={preferencesKey}
              orgSlug={orgSlug}
              slug={slug}
              query={query}
              members={project.members}
              extraRowActions={rowActions}
            />
          ) : undefined
        }
      />
    </PageContainer>
  )
}
