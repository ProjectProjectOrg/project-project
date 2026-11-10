import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { JiraSite } from "@pp/shared"
import { Link, useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Select, SelectTrigger } from "@/components/ui/select"
import {
  createJiraMigration,
  jiraMigrations,
  jiraOrgRequest
} from "@/features/jira/atoms/jiraMigration"
import { ProjectPicker } from "@/features/jira/components/ProjectPicker"
import { StepFrame, StepNote } from "@/features/jira/components/StepFrame"
import { isJiraStorageUnavailable } from "@/features/jira/lib/errors"
import { unfinishedImportOf } from "@/features/jira/lib/imports"
import {
  defaultCloudId,
  sourceRequestFor,
  type SourceRequest
} from "@/features/jira/lib/source"
import { errorMessage } from "@/lib/errorMessage"
import { useAppForm, useFormValues } from "@/lib/form"
import { mutationFailure } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import { jiraSourceFormOpts } from "./opts"

type CreateFailure = Readonly<{ message: string; storage: boolean }>

export function JiraSourceForm({
  orgSlug,
  sites
}: Readonly<{ orgSlug: string; sites: ReadonlyArray<JiraSite> }>) {
  const navigate = useNavigate()
  const listReq = jiraOrgRequest(orgSlug)
  const imports = useAtomValue(jiraMigrations(listReq))
  const create = useAtomSet(createJiraMigration(listReq), {
    mode: "promiseExit"
  })
  const createState = useAtomValue(createJiraMigration(listReq))
  const request = useRef<SourceRequest | null>(null)
  const [opts] = useState(() => jiraSourceFormOpts(defaultCloudId(sites)))
  const form = useAppForm({
    ...opts,
    onSubmit: async ({ value }) => {
      request.current = sourceRequestFor(
        request.current,
        value.cloudId,
        value.projectId
      )
      const exit = await create({
        requestId: request.current.id,
        cloudId: value.cloudId,
        projectId: value.projectId
      })
      if (Exit.isSuccess(exit))
        await navigate({
          to: "/orgs/$orgSlug/migrations/jira/$migrationId",
          params: { orgSlug, migrationId: exit.value.id }
        })
    }
  })
  const values = useFormValues(form)
  const singleSite = sites.length === 1 ? sites[0] : undefined
  const existing =
    AsyncResult.isSuccess(imports) &&
    values.cloudId !== "" &&
    values.projectId !== ""
      ? unfinishedImportOf(imports.value, values.cloudId, values.projectId)
      : undefined
  const failure = mutationFailure(
    createState,
    (error): CreateFailure => ({
      message: errorMessage(error),
      storage: isJiraStorageUnavailable(error)
    }),
    (): CreateFailure => ({
      message: m.jira_import_error_unexpected(),
      storage: false
    })
  )

  return (
    <StepFrame
      title={m.jira_import_source_title()}
      description={m.jira_import_source_description()}
      error={failure?.message ?? null}
      end={
        <>
          {failure?.storage === true ? (
            <Button
              variant="tertiary"
              size="sm"
              render={
                <Link
                  to="/orgs/$orgSlug/settings/storage"
                  params={{ orgSlug }}
                />
              }
            >
              {m.jira_import_action_connect_storage()}
            </Button>
          ) : null}
          <form.Field name="projectId">
            {(field) =>
              field.errors.length > 0 ? (
                <StepNote>{m.jira_import_source_project_required()}</StepNote>
              ) : null
            }
          </form.Field>
          {existing === undefined ? (
            <Button
              loading={createState.waiting}
              onClick={() => void form.handleSubmit()}
            >
              {m.jira_import_action_scan()}
            </Button>
          ) : (
            <Button
              render={
                <Link
                  to="/orgs/$orgSlug/migrations/jira/$migrationId"
                  params={{ orgSlug, migrationId: existing.id }}
                />
              }
            >
              {m.jira_import_action_open_existing()}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {sites.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            {m.jira_import_source_no_sites()}
          </p>
        ) : null}
        {singleSite === undefined ? null : (
          <p className="text-[13px] text-muted-foreground">
            {m.jira_import_source_site({ site: singleSite.name })}
          </p>
        )}
        {sites.length > 1 ? (
          <form.Field name="cloudId">
            {(field) => (
              <label className="flex max-w-sm flex-col gap-2 text-[13px] font-medium">
                <span>{m.jira_import_source_site_label()}</span>
                <Select
                  value={field.value === "" ? null : field.value}
                  onValueChange={(next) => {
                    field.handleChange(next)
                    form.setFieldValue("projectId", "")
                  }}
                  items={sites.map((site) => ({
                    value: site.cloudId,
                    label: site.name
                  }))}
                >
                  <SelectTrigger
                    aria-label={m.jira_import_source_site_label()}
                    placeholder={m.jira_import_source_site_placeholder()}
                    className="w-full"
                    error={
                      field.errors.length > 0
                        ? m.jira_import_source_site_required()
                        : undefined
                    }
                  />
                </Select>
              </label>
            )}
          </form.Field>
        ) : null}
        {values.cloudId === "" ? null : (
          <form.Field name="projectId">
            {(field) => (
              <ProjectPicker
                cloudId={values.cloudId}
                projectId={field.value}
                onPick={field.handleChange}
              />
            )}
          </form.Field>
        )}
        {existing === undefined ? null : (
          <p className="text-[13px] text-muted-foreground">
            {m.jira_import_source_existing({
              project: existing.sourceProjectName
            })}
          </p>
        )}
      </div>
    </StepFrame>
  )
}
