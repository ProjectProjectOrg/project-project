import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { meAtom } from "@/atoms/auth"
import { TagAdminSection } from "@/components/TagAdminSection"
import { useProject } from "./-context"
import type { Member, Role } from "@projectproject/shared"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/$slug/tags")({
  component: TagsTab,
  loader: () => ({
    crumb: { type: "static" as const, label: "Tags" }
  })
})

function TagsTab() {
  const { orgSlug } = Route.useParams()
  const project = useProject()
  const me = useAtomValue(meAtom)
  if (!Result.isSuccess(me)) return null
  const callerId = me.value.id
  const callerRole = roleOf(project.members, callerId)
  if (callerRole !== "owner" && callerRole !== "admin") return null

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold tracking-tight">Tags</h1>
      <TagAdminSection orgSlug={orgSlug} slug={project.slug} />
    </section>
  )
}

function roleOf(members: ReadonlyArray<Member>, userId: string): Role | null {
  for (const m of members) if (m.id === userId) return m.role
  return null
}
