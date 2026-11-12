import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { JiraMigrationSummary } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { Plus } from "lucide-react"
import { MotionConfig } from "motion/react"

import { AsyncView } from "@/components/shell/AsyncView"
import { PageContainer, PageHeader } from "@/components/shell/Page"
import { ReadFailure } from "@/components/shell/ReadFailure"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from "@/components/ui/empty"
import {
  jiraMigrations,
  jiraOrgRequest,
  jiraProfile
} from "@/features/jira/atoms/jiraMigration"
import { useJiraImportsPolling } from "@/features/jira/hooks/useJiraMigrationPolling"
import { jiraConnectHref } from "@/features/jira/lib/connect"
import { groupJiraImports } from "@/features/jira/lib/imports"
import { isActiveJiraImport } from "@/features/jira/lib/stages"
import { m } from "@/paraglide/messages"

import { ImportGroup } from "./ImportGroup"
import { ImportPoints } from "./ImportPoints"

export function JiraImportsPage({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const atom = jiraMigrations(jiraOrgRequest(orgSlug))
  const result = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  useJiraImportsPolling(
    orgSlug,
    AsyncResult.isSuccess(result) &&
      result.value.some((summary) => isActiveJiraImport(summary.status))
  )
  return (
    <MotionConfig reducedMotion="user">
      <PageContainer width="focused" className="gap-8">
        <div className="flex items-end justify-between gap-4">
          <PageHeader>
            <h1>{m.jira_import_list_title()}</h1>
            <p>{m.jira_import_list_description()}</p>
          </PageHeader>
          <Button
            leadingIcon={Plus}
            className="shrink-0"
            render={
              <Link
                to="/orgs/$orgSlug/migrations/jira/new"
                params={{ orgSlug }}
              />
            }
          >
            {m.jira_import_action_new()}
          </Button>
        </div>
        <AsyncView
          result={result}
          onInitial={() => <ListSkeleton />}
          onFailure={(failure) => (
            <ReadFailure failure={failure} onRetry={refresh} />
          )}
          onSuccess={({ value }) =>
            value.length === 0 ? (
              <ImportsEmpty orgSlug={orgSlug} />
            ) : (
              <ImportGroups orgSlug={orgSlug} imports={value} />
            )
          }
        />
      </PageContainer>
    </MotionConfig>
  )
}

function ImportGroups({
  orgSlug,
  imports
}: Readonly<{
  orgSlug: string
  imports: ReadonlyArray<JiraMigrationSummary>
}>) {
  const groups = groupJiraImports(imports)
  return (
    <div className="flex flex-col gap-8">
      {groups.running.length > 0 ? (
        <ImportGroup
          orgSlug={orgSlug}
          title={m.jira_import_list_running()}
          imports={groups.running}
        />
      ) : null}
      {groups.setup.length > 0 ? (
        <ImportGroup
          orgSlug={orgSlug}
          title={m.jira_import_list_setup()}
          imports={groups.setup}
        />
      ) : null}
      {groups.finished.length > 0 ? (
        <ImportGroup
          orgSlug={orgSlug}
          title={m.jira_import_list_finished()}
          imports={groups.finished}
        />
      ) : null}
    </div>
  )
}

function ImportsEmpty({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const profile = useAtomValue(jiraProfile)
  const connected =
    AsyncResult.isSuccess(profile) && profile.value.status === "connected"
  const newPath = `/orgs/${orgSlug}/migrations/jira/new`
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{m.jira_import_empty_title()}</EmptyTitle>
        <EmptyDescription>{m.jira_import_empty_description()}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <ImportPoints muted />
        {AsyncResult.isInitial(profile) ? null : connected ? (
          <Button
            render={
              <Link
                to="/orgs/$orgSlug/migrations/jira/new"
                params={{ orgSlug }}
              />
            }
          >
            {m.jira_import_action_new()}
          </Button>
        ) : (
          <Button
            render={
              <a
                href={jiraConnectHref(newPath)}
                aria-label={m.jira_import_action_connect()}
              />
            }
          >
            {m.jira_import_action_connect()}
          </Button>
        )}
      </EmptyContent>
    </Empty>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((index) => (
        <div key={index} className="skeleton h-9 rounded-lg" />
      ))}
    </div>
  )
}
