import { useAtomRefresh, useAtomValue } from "@effect/atom-react"

import { AsyncView } from "@/components/shell/AsyncView"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import { PageContainer, PageHeader } from "@/components/shell/Page"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from "@/components/ui/empty"
import {
  referencesRequest,
  referencesToFix,
  type ReferencesRequest
} from "@/features/project-references/atoms/references"
import { ReferenceGroupCard } from "@/features/project-references/components/ReferenceGroupCard"
import { groupReferences } from "@/features/project-references/lib/referenceGroups"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

export function ReferencesPage() {
  const canFix = useProjectActor().call("projectReferences", "list")

  return (
    <PageContainer>
      <PageHeader>
        <h1>{m.project_references_title()}</h1>
        <p>{m.project_references_description()}</p>
      </PageHeader>
      {canFix ? <References /> : <NotFoundPage contained />}
    </PageContainer>
  )
}

function References() {
  const { orgSlug, slug } = useProjectRoute()
  const req = referencesRequest(orgSlug, slug)
  const result = useAtomValue(referencesToFix(req))
  const refresh = useAtomRefresh(referencesToFix(req))

  return (
    <AsyncView
      result={result}
      reset={refresh}
      contained
      onInitial={() => <ReferencesSkeleton />}
      onSuccess={({ value }) => (
        <ReferenceGroups req={req} groups={groupReferences(value.items)} />
      )}
    />
  )
}

function ReferenceGroups({
  req,
  groups
}: Readonly<{
  req: ReferencesRequest
  groups: ReturnType<typeof groupReferences>
}>) {
  if (groups.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{m.project_references_empty_title()}</EmptyTitle>
          <EmptyDescription>
            {m.project_references_empty_body()}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <ReferenceGroupCard
          key={`${group.kind}:${group.target}`}
          req={req}
          group={group}
        />
      ))}
    </div>
  )
}

function ReferencesSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="skeleton h-28 rounded-lg bg-muted/60" />
      <div className="skeleton h-28 rounded-lg bg-muted/60" />
    </div>
  )
}
