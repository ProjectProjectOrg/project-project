import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { meAtom } from "@/atoms/auth"
import { MembersSection } from "@/components/MembersSection"
import { useProject } from "./-context"
import type { Member, Role } from "@projectproject/shared"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/members"
)({
  component: MembersTab,
  loader: () => ({
    crumb: { type: "static" as const, label: "Members" }
  })
})

function MembersTab() {
  const { orgSlug } = Route.useParams()
  const project = useProject()
  const me = useAtomValue(meAtom)
  if (!Result.isSuccess(me)) return null
  const callerId = me.value.id
  const callerRole = roleOf(project.members, callerId)
  if (!callerRole) return null

  return (
    <MembersSection
      orgSlug={orgSlug}
      slug={project.slug}
      members={project.members}
      callerRole={callerRole}
      callerId={callerId}
    />
  )
}

function roleOf(members: ReadonlyArray<Member>, userId: string): Role | null {
  for (const m of members) if (m.id === userId) return m.role
  return null
}
