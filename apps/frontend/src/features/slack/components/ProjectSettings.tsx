import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { SlackEvent, type SlackProjectStatus } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSwitch } from "@/components/shell/settings/SettingsTextField"
import { Button } from "@/components/ui/button"
import { Select, SelectTrigger } from "@/components/ui/select"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import { mutationErrorText, slackActionErrorMessage } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import {
  disconnectSlackProject,
  saveSlackProject,
  slackChannels,
  slackProject,
  slackProjectRequest,
  testSlackProject,
  type SlackProjectRequest
} from "../atoms/slack"

type ProjectProps = Readonly<{
  orgSlug: string
  slug: string
  canManage: boolean
}>

const EVENT_LABELS: Readonly<Record<SlackEvent, () => string>> = {
  ticket_created: () => m.slack_event_ticket_created(),
  ticket_completed: () => m.slack_event_ticket_completed(),
  ticket_reopened: () => m.slack_event_ticket_reopened(),
  sprint_started: () => m.slack_event_sprint_started(),
  sprint_completed: () => m.slack_event_sprint_completed()
}

export function SlackProjectRow({ orgSlug, slug, canManage }: ProjectProps) {
  const result = useAtomValue(slackProject(slackProjectRequest(orgSlug, slug)))
  return (
    <AsyncView
      result={result}
      contained
      onInitial={() => (
        <SettingsRow
          icon={<IntegrationLogo kind="slack" />}
          label={m.slack_heading()}
          description={
            <span className="block h-3 w-40 animate-pulse rounded bg-muted" />
          }
        />
      )}
      onSuccess={({ value, waiting }) =>
        value.workspace ? (
          <SlackProjectContent
            req={slackProjectRequest(orgSlug, slug)}
            status={value}
            workspace={value.workspace.teamName}
            waiting={waiting}
            canManage={canManage}
          />
        ) : (
          <SettingsRow
            icon={<IntegrationLogo kind="slack" />}
            label={m.slack_heading()}
            description={m.slack_project_unavailable()}
          />
        )
      }
    />
  )
}

function SlackProjectContent({
  req,
  status,
  workspace,
  waiting,
  canManage
}: Readonly<{
  req: SlackProjectRequest
  status: SlackProjectStatus
  workspace: string
  waiting: boolean
  canManage: boolean
}>) {
  return canManage ? (
    <ManagedSlackRow
      req={req}
      status={status}
      workspace={workspace}
      waiting={waiting}
    />
  ) : (
    <SettingsRow
      icon={<IntegrationLogo kind="slack" />}
      label={m.slack_heading()}
      description={
        <span className={cn(waiting && "animate-pulse")}>
          {status.settings
            ? m.slack_project_channel({
                workspace,
                channel: status.settings.channelName
              })
            : m.slack_connected({ workspace })}
        </span>
      }
    />
  )
}

function ManagedSlackRow({
  req,
  status,
  workspace,
  waiting
}: Readonly<{
  req: SlackProjectRequest
  status: SlackProjectStatus
  workspace: string
  waiting: boolean
}>) {
  const channelsResult = useAtomValue(slackChannels(req))
  const refreshChannels = useAtomRefresh(slackChannels(req))
  const save = useAtomSet(saveSlackProject(req))
  const disconnect = useAtomSet(disconnectSlackProject(req))
  const test = useAtomSet(testSlackProject(req), { mode: "promiseExit" })
  const saveState = useAtomValue(saveSlackProject(req))
  const disconnectState = useAtomValue(disconnectSlackProject(req))
  const testState = useAtomValue(testSlackProject(req))
  const busy = saveState.waiting || disconnectState.waiting || testState.waiting
  const settings = status.settings
  const [testQueued, setTestQueued] = useState(false)
  const channels = Result.isSuccess(channelsResult) ? channelsResult.value : []
  const channelName = settings
    ? (channels.find((channel) => channel.id === settings.channelId)?.name ??
      settings.channelName)
    : null

  useEffect(() => {
    if (!testQueued) return undefined
    const timeout = window.setTimeout(() => setTestQueued(false), 4000)
    return () => window.clearTimeout(timeout)
  }, [testQueued])

  return (
    <SettingsRow
      icon={<IntegrationLogo kind="slack" />}
      label={m.slack_heading()}
      description={
        <span className={cn((waiting || busy) && "animate-pulse")}>
          {testQueued
            ? m.slack_test_queued()
            : channelName !== null
              ? m.slack_project_channel({ workspace, channel: channelName })
              : m.slack_channel_hint()}
        </span>
      }
      error={
        mutationErrorText(saveState, slackActionErrorMessage) ??
        mutationErrorText(disconnectState, slackActionErrorMessage) ??
        mutationErrorText(testState, slackActionErrorMessage) ??
        (channelsResult.waiting
          ? null
          : mutationErrorText(channelsResult, slackActionErrorMessage))
      }
    >
      <Select
        value={settings?.channelId ?? null}
        onValueChange={(id) => {
          const channel = channels.find((item) => item.id === id)
          if (channel)
            save({
              channelId: channel.id,
              events: settings?.events ?? SlackEvent.literals
            })
        }}
        disabled={busy || channels.length === 0}
        items={channels.map((channel) => ({
          value: channel.id,
          label: m.slack_channel_label({ channel: channel.name })
        }))}
      >
        <SelectTrigger
          aria-label={m.slack_channel()}
          className="w-48"
          placeholder={m.slack_choose_channel()}
          selectedLabel={
            channelName !== null
              ? m.slack_channel_label({ channel: channelName })
              : undefined
          }
        />
      </Select>
      <Button
        type="button"
        variant="tertiary"
        size="icon-sm"
        aria-label={m.slack_refresh_channels()}
        title={m.slack_refresh_channels()}
        disabled={busy || channelsResult.waiting}
        onClick={refreshChannels}
        className={cn(channelsResult.waiting && "animate-pulse")}
      >
        <RefreshCw strokeWidth={1.75} />
      </Button>
      {settings ? (
        <>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            loading={testState.waiting}
            disabled={busy}
            onClick={() =>
              void test().then((exit) => {
                if (Exit.isSuccess(exit)) setTestQueued(true)
              })
            }
          >
            {m.slack_test()}
          </Button>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            loading={disconnectState.waiting}
            disabled={busy}
            onClick={() => disconnect()}
          >
            {m.slack_disconnect()}
          </Button>
        </>
      ) : null}
    </SettingsRow>
  )
}

export function SlackProjectEvents({ orgSlug, slug, canManage }: ProjectProps) {
  const req = slackProjectRequest(orgSlug, slug)
  const result = useAtomValue(slackProject(req))
  const save = useAtomSet(saveSlackProject(req))
  const settings = Result.isSuccess(result) ? result.value.settings : null
  if (!canManage || !settings) return null
  return (
    <SettingsSection
      title={m.slack_events()}
      description={m.slack_publish_notice()}
    >
      <SettingsGroup>
        {SlackEvent.literals.map((kind) => (
          <SettingsRow key={kind} label={EVENT_LABELS[kind]()}>
            <SettingsSwitch
              checked={settings.events.includes(kind)}
              onCheckedChange={(checked) =>
                save({
                  channelId: settings.channelId,
                  events: checked
                    ? [...settings.events, kind]
                    : settings.events.filter((event) => event !== kind)
                })
              }
            />
          </SettingsRow>
        ))}
      </SettingsGroup>
    </SettingsSection>
  )
}
