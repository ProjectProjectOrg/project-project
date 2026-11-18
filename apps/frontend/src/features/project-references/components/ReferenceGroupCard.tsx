import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { FixReferenceAction, ReferenceKind } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Hash, Link2, UserRound } from "@pp/ui/icons"
import type { IconComponent } from "@pp/ui/lib/icon"
import { Link } from "@tanstack/react-router"

import {
  fixReference,
  type ReferencesRequest
} from "@/features/project-references/atoms/references"
import { LinkTargetMenu } from "@/features/project-references/components/LinkTargetMenu"
import type {
  ReferenceGroup,
  ReferenceOccurrences
} from "@/features/project-references/lib/referenceGroups"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

const KIND_ICONS = {
  user: UserRound,
  ticket: Hash,
  link: Link2
} satisfies Record<ReferenceKind, IconComponent>

const KIND_LABELS = {
  user: m.project_references_kind_user,
  ticket: m.project_references_kind_ticket,
  link: m.project_references_kind_link
} satisfies Record<ReferenceKind, () => string>

type Apply = (ticketId: string | null, action: FixReferenceAction) => void

export function ReferenceGroupCard({
  req,
  group
}: Readonly<{ req: ReferencesRequest; group: ReferenceGroup }>) {
  const mutation = fixReference({
    req,
    kind: group.kind,
    target: group.target
  })
  const fix = useAtomSet(mutation)
  const error = mutationErrorText(useAtomValue(mutation))
  const apply: Apply = (ticketId, action) =>
    fix({ kind: group.kind, target: group.target, ticketId, action })
  const several = group.tickets.length > 1
  const Icon = KIND_ICONS[group.kind]

  return (
    <section className="flex flex-col rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-start gap-3 p-4">
        <Icon
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-body font-semibold">
              {group.label}
            </span>
            <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
              {m.project_references_occurrences({ count: group.count })}
            </span>
          </div>
          <div className="flex min-w-0 items-baseline gap-1.5 text-caption text-muted-foreground">
            <span className="shrink-0">{KIND_LABELS[group.kind]()}</span>
            <span className="truncate tabular-nums">{group.target}</span>
          </div>
          {error ? (
            <p role="alert" className="text-caption text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <FixActions
          kind={group.kind}
          linkLabel={
            several
              ? m.project_references_link_all()
              : m.project_references_link()
          }
          plainLabel={
            several
              ? m.project_references_plain_all()
              : m.project_references_plain()
          }
          onFix={(action) => apply(null, action)}
        />
      </header>
      <ul className="flex flex-col border-t border-border">
        {group.tickets.map((occurrences) => (
          <OccurrenceRow
            key={occurrences.ticketId}
            kind={group.kind}
            occurrences={occurrences}
            onFix={
              several ? (action) => apply(occurrences.ticketId, action) : null
            }
          />
        ))}
      </ul>
    </section>
  )
}

function OccurrenceRow({
  kind,
  occurrences,
  onFix
}: Readonly<{
  kind: ReferenceKind
  occurrences: ReferenceOccurrences
  onFix: ((action: FixReferenceAction) => void) | null
}>) {
  const { orgSlug, slug } = useProjectRoute()

  return (
    <li className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
      <Link
        to="/orgs/$orgSlug/projects/$slug/tickets/$id"
        params={{ orgSlug, slug, id: occurrences.ticketId }}
        className="shrink-0 rounded-md px-1 text-caption leading-5 text-muted-foreground tabular-nums transition-colors hover:bg-hover hover:text-foreground"
      >
        {occurrences.ticketId}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {occurrences.snippets.map((snippet) => (
          <p
            key={snippet}
            className="line-clamp-2 text-body leading-5 break-words text-muted-foreground"
          >
            {snippet}
          </p>
        ))}
      </div>
      {onFix ? (
        <FixActions
          kind={kind}
          linkLabel={m.project_references_link()}
          plainLabel={m.project_references_plain()}
          onFix={onFix}
        />
      ) : null}
    </li>
  )
}

function FixActions({
  kind,
  linkLabel,
  plainLabel,
  onFix
}: Readonly<{
  kind: ReferenceKind
  linkLabel: string
  plainLabel: string
  onFix: (action: FixReferenceAction) => void
}>) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <LinkTargetMenu
        kind={kind}
        label={linkLabel}
        onPick={(to) => onFix({ kind: "link", to })}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onFix({ kind: "plain" })}
      >
        {plainLabel}
      </Button>
    </div>
  )
}
