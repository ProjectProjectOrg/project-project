import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { meAtom } from "@/atoms/auth"
import { TagAdminSection } from "@/components/TagAdminSection"
import { useProject } from "./-context"
import type { Member, Role } from "@projectproject/shared"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings"
)({
  component: SettingsPage,
  loader: () => ({
    crumb: { type: "static" as const, label: "Settings" }
  })
})

function SettingsPage() {
  const { orgSlug, slug } = Route.useParams()
  const project = useProject()
  const me = useAtomValue(meAtom)
  if (!Result.isSuccess(me)) return null
  const role = roleOf(project.members, me.value.id)
  if (role !== "owner" && role !== "admin") {
    throw redirect({
      to: "/orgs/$orgSlug/projects/$slug",
      params: { orgSlug, slug }
    })
  }

  return (
    <section className="flex flex-col gap-8">
      <header>
        <h1 className="text-lg font-semibold tracking-tight">Project settings</h1>
        <p className="text-xs text-muted-foreground">
          Owner and admin only.
        </p>
      </header>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Tags</h2>
        <TagAdminSection orgSlug={orgSlug} slug={slug} />
      </section>
    </section>
  )
}

function roleOf(members: ReadonlyArray<Member>, userId: string): Role | null {
  for (const m of members) if (m.id === userId) return m.role
  return null
}
