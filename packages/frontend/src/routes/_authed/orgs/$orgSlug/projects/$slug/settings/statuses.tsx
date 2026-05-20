import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { projectKey, projectStatusesAtom } from "@/atoms/projectStatuses"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/statuses"
)({
  component: StatusesSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_settings_statuses_tab() }
  })
})

function StatusesSettings() {
  const { orgSlug, slug } = Route.useParams()
  const result = useAtomValue(projectStatusesAtom(projectKey(orgSlug, slug)))

  if (!Result.isSuccess(result)) {
    return (
      <section className="flex w-full flex-col gap-2 text-sm text-muted-foreground">
        Loading…
      </section>
    )
  }

  const statuses = [...result.value].toSorted((a, b) =>
    a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0
  )

  return (
    <section className="flex w-full flex-col gap-2">
      {statuses.map((s) => (
        <div
          key={s.slug}
          className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <span className="font-mono text-xs text-muted-foreground">
            {s.slug}
          </span>
          <span className="font-medium">{s.label}</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {s.icon} · {s.color}
          </span>
        </div>
      ))}
    </section>
  )
}
