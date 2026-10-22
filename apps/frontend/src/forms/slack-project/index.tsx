import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { SlackEvent, SlackProjectStatus } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { ErrorPage } from "@/components/ErrorPage"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select"
import {
  disconnectSlackProject,
  saveSlackProject,
  slackChannels,
  slackProjectRequest,
  testSlackProject,
  type SlackProjectRequest
} from "@/features/slack/atoms/slack"
import { SlackActionError } from "@/features/slack/components/ActionError"
import { useAppForm } from "@/lib/form"
import { m } from "@/paraglide/messages"

import { slackProjectOpts } from "./opts"

export function SlackProjectForm({
  orgSlug,
  slug,
  status
}: Readonly<{ orgSlug: string; slug: string; status: SlackProjectStatus }>) {
  const req = slackProjectRequest(orgSlug, slug)
  const save = useAtomSet(saveSlackProject(req), { mode: "promiseExit" })
  const disconnect = useAtomSet(disconnectSlackProject(req), {
    mode: "promiseExit"
  })
  const test = useAtomSet(testSlackProject(req), { mode: "promiseExit" })
  const saveState = useAtomValue(saveSlackProject(req))
  const disconnectState = useAtomValue(disconnectSlackProject(req))
  const testState = useAtomValue(testSlackProject(req))
  const busy = saveState.waiting || disconnectState.waiting || testState.waiting
  const form = useAppForm({
    ...slackProjectOpts,
    defaultValues: {
      channelId: status.settings?.channelId ?? "",
      events: [
        ...(status.settings?.events ?? slackProjectOpts.defaultValues.events)
      ]
    },
    onSubmit: async ({ value }) => {
      await save(value)
    }
  })
  const events = [
    ["ticket_created", m.slack_event_ticket_created()],
    ["ticket_completed", m.slack_event_ticket_completed()],
    ["ticket_reopened", m.slack_event_ticket_reopened()],
    ["sprint_started", m.slack_event_sprint_started()],
    ["sprint_completed", m.slack_event_sprint_completed()]
  ] satisfies ReadonlyArray<readonly [SlackEvent, string]>

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy) void form.handleSubmit()
        }}
      >
        <form.Field name="channelId">
          {(field) => (
            <ChannelPicker
              req={req}
              value={field.value}
              disabled={busy}
              invalid={field.errors.length > 0}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
        <form.Field name="events">
          {(field) => (
            <fieldset disabled={busy} className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">
                {m.slack_events()}
              </legend>
              <div className="flex flex-wrap gap-2">
                {events.map(([kind, label]) => (
                  <Button
                    key={kind}
                    type="button"
                    size="sm"
                    disabled={busy}
                    variant={field.value.includes(kind) ? "secondary" : "ghost"}
                    aria-pressed={field.value.includes(kind)}
                    onClick={() =>
                      field.handleChange(
                        field.value.includes(kind)
                          ? field.value.filter((event) => event !== kind)
                          : [...field.value, kind]
                      )
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </fieldset>
          )}
        </form.Field>
        <p className="text-xs text-muted-foreground">
          {m.slack_publish_notice()}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {m.slack_save()}
          </Button>
          {status.settings ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void test()}
              >
                {m.slack_test()}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void disconnect()}
              >
                {m.slack_disconnect()}
              </Button>
            </>
          ) : null}
        </div>
      </form>
      {Result.isSuccess(testState) && !testState.waiting ? (
        <p role="status" className="text-xs text-muted-foreground">
          {m.slack_test_queued()}
        </p>
      ) : null}
      <SlackActionError result={saveState} />
      <SlackActionError result={disconnectState} />
      <SlackActionError result={testState} />
    </div>
  )
}

function ChannelPicker({
  req,
  value,
  disabled,
  onChange,
  invalid
}: Readonly<{
  req: SlackProjectRequest
  value: string
  disabled: boolean
  invalid: boolean
  onChange: (value: string) => void
}>) {
  const result = useAtomValue(slackChannels(req))
  const refresh = useAtomRefresh(slackChannels(req))
  return Result.matchWithError(result, {
    onInitial: () => <div className="h-9 animate-pulse rounded-lg bg-muted" />,
    onError: (error) => <ErrorPage contained error={error} reset={refresh} />,
    onDefect: (error) => <ErrorPage contained error={error} reset={refresh} />,
    onSuccess: ({ value: channels }) => (
      <div className="flex flex-col gap-2">
        <label
          id={`slack-channel-${req.params.slug}`}
          className="text-sm font-medium"
        >
          {m.slack_channel()}
        </label>
        <Select
          value={value}
          onValueChange={onChange}
          disabled={disabled || channels.length === 0}
        >
          <SelectTrigger
            error={invalid ? m.slack_choose_channel() : undefined}
            aria-labelledby={`slack-channel-${req.params.slug}`}
            placeholder={m.slack_choose_channel()}
            selectedLabel={
              channels.find((channel) => channel.id === value)?.name ?? null
            }
          />
          <SelectContent>
            {channels.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                {`#${channel.name}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {channels.length ? m.slack_channel_hint() : m.slack_no_channels()}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="self-start"
          onClick={refresh}
        >
          {m.slack_refresh_channels()}
        </Button>
      </div>
    )
  })
}
