import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import type { ProjectStatus } from "@projectproject/shared"
import { projectKey, projectStatusesAtom } from "@/atoms/projectStatuses"
import { ticketsCountAtom, ticketsCountKey } from "@/atoms/tickets"
import { StatusCreateRow } from "@/components/StatusCreateRow"
import { StatusDeleteForm } from "@/components/StatusDeleteForm"
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
  const [deleting, setDeleting] = useState<ProjectStatus | null>(null)

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
      {statuses.map((s, i) => {
        if (deleting?.slug === s.slug) {
          return (
            <DeleteRow
              key={s.slug}
              status={s}
              statuses={statuses}
              orgSlug={orgSlug}
              slug={slug}
              onDone={() => setDeleting(null)}
            />
          )
        }
        return (
          <StatusEditorRow
            key={s.slug}
            status={s}
            statuses={statuses}
            orgSlug={orgSlug}
            slug={slug}
            prev={statuses[i - 1]}
            next={statuses[i + 1]}
            onRequestDelete={(target) => setDeleting(target)}
          />
        )
      })}
      <StatusCreateRow orgSlug={orgSlug} slug={slug} />
    </section>
  )
}

type DeleteRowProps = {
  status: ProjectStatus
  statuses: ReadonlyArray<ProjectStatus>
  orgSlug: string
  slug: string
  onDone: () => void
}

function DeleteRow({ status, statuses, orgSlug, slug, onDone }: DeleteRowProps) {
  const countResult = useAtomValue(
    ticketsCountAtom(
      ticketsCountKey(orgSlug, slug, { filter: { status: [status.slug] } })
    )
  )
  const affectedCount = Result.isSuccess(countResult)
    ? (countResult.value.byStatus[status.slug] ?? 0)
    : 0

  return (
    <StatusDeleteForm
      status={status}
      statuses={statuses}
      affectedCount={affectedCount}
      orgSlug={orgSlug}
      slug={slug}
      onDone={onDone}
    />
  )
}
