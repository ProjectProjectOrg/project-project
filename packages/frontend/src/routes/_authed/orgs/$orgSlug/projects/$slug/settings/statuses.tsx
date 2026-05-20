import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { projectKey, projectStatusesAtom } from "@/atoms/projectStatuses"
import { StatusEditorRow } from "@/components/StatusEditorRow"
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
        <StatusEditorRow
          key={s.slug}
          status={s}
          statuses={statuses}
          orgSlug={orgSlug}
          slug={slug}
          onRequestDelete={() => {
            /* wired in D3 */
          }}
        />
      ))}
    </section>
  )
}
