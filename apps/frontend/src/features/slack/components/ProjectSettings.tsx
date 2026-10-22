import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { SlackEvent, type SlackProjectStatus } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { RefreshCw } from "lucide-react"

import { ErrorPage } from "@/components/ErrorPage"
import { IntegrationLogo } from "@/components/settings/IntegrationLogo"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/settings/SettingsSection"
import { SettingsSwitch } from "@/components/settings/SettingsTextField"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select"
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
import { slackActionError } from "./actionError"

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
  return Result.matchWithError(result, {
    onInitial: () => (
      <SettingsRow
        icon={<IntegrationLogo kind="slack" />}
        label={m.slack_heading()}
        description={
          <span className="block h-3 w-40 animate-pulse rounded bg-muted" />
        }
      />
    ),
    onError: (error) => <ErrorPage contained error={error} />,
    onDefect: (defect) => <ErrorPage contained error={defect} />,
    onSuccess: ({ value, waiting }) =>
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
  })
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
  const test = useAtomSet(testSlackProject(req))
  const saveState = useAtomValue(saveSlackProject(req))
  const disconnectState = useAtomValue(disconnectSlackProject(req))
  const testState = useAtomValue(testSlackProject(req))
  const busy = disconnectState.waiting || testState.waiting
  const settings = status.settings
  const testQueued = Result.isSuccess(testState) && !testState.waiting
  const channels = Result.isSuccess(channelsResult) ? channelsResult.value : []

  return (
    <SettingsRow
      icon={<IntegrationLogo kind="slack" />}
      label={m.slack_heading()}
      description={
        <span className={cn((waiting || busy) && "animate-pulse")}>
          {testQueued
            ? m.slack_test_queued()
            : settings
              ? m.slack_project_channel({
                  workspace,
                  channel: settings.channelName
                })
              : m.slack_channel_hint()}
        </span>
      }
      error={
        slackActionError(saveState) ??
        slackActionError(disconnectState) ??
        slackActionError(testState) ??
        (channelsResult.waiting ? null : slackActionError(channelsResult))
      }
    >
      <Select
        value={settings?.channelId ?? ""}
        onValueChange={(id) => {
          const channel = channels.find((item) => item.id === id)
          if (channel)
            save({
              channelId: channel.id,
              channelName: channel.name,
              events: settings?.events ?? SlackEvent.literals
            })
        }}
        disabled={busy || channels.length === 0}
      >
        <SelectTrigger
          aria-label={m.slack_channel()}
          className="w-48"
          placeholder={m.slack_choose_channel()}
          selectedLabel={settings ? `#${settings.channelName}` : undefined}
        />
        <SelectContent>
          {channels.map((channel) => (
            <SelectItem key={channel.id} value={channel.id}>
              {`#${channel.name}`}
            </SelectItem>
          ))}
        </SelectContent>
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
            onClick={() => test()}
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
                  ...settings,
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
