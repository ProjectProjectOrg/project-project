import type { ConnectSlackInput, SlackOrgStatus } from "@pp/shared"
import { SlackAuthInvalid } from "@pp/shared"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { slackManifest, slackOrgRequest } from "@/features/slack/atoms/slack"
import { m } from "@/paraglide/messages"

import { SlackConnectionForm } from "."

const mocks = vi.hoisted(() => ({
  save: vi.fn<
    (
      input: ConnectSlackInput
    ) => Promise<Exit.Exit<SlackOrgStatus, SlackAuthInvalid>>
  >()
}))

vi.mock("@effect/atom-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effect/atom-react")>()),
  useAtomSet: () => mocks.save,
  useAtomValue: (atom: Atom.Atom<unknown>) =>
    atom === slackManifest(slackOrgRequest("example"))
      ? Result.success({
          createUrl: "https://api.slack.com/apps?new_app=1",
          manifest: "{}",
          redirectUri:
            "https://pp.example.test/api/integrations/slack/oauth/callback"
        })
      : Result.initial()
}))

const connected: SlackOrgStatus = {
  connection: {
    teamId: "TEXAMPLE",
    teamName: "Example workspace",
    clientId: "123.456",
    lastError: null
  }
}

beforeEach(() => {
  mocks.save.mockImplementation(async (_input: ConnectSlackInput) =>
    Exit.succeed(connected)
  )
})
afterEach(() => {
  cleanup()
  mocks.save.mockReset()
})

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const next = () =>
  fireEvent.click(
    screen.getByRole("button", { name: m.slack_setup_continue() })
  )

it("validates each step, retains values going back and clears secrets after connecting", async () => {
  const view = render(
    <SlackConnectionForm orgSlug="example" status={{ connection: null }} />
  )
  expect(
    screen.getByText(m.slack_setup_progress({ current: 1, total: 4 }))
  ).toBeTruthy()
  expect(screen.queryByLabelText(m.slack_bot_token())).toBeNull()
  next()
  next()
  expect(await screen.findByText(m.slack_validation_bot_token())).toBeTruthy()
  expect(screen.queryByLabelText(m.slack_app_token())).toBeNull()
  change(m.slack_bot_token(), "xapp-wrong-kind")
  next()
  expect(screen.getByText(m.slack_validation_bot_token())).toBeTruthy()
  change(m.slack_bot_token(), "xoxb-test-bot")
  next()
  await screen.findByLabelText(m.slack_app_token())
  next()
  expect(await screen.findByText(m.slack_validation_app_token())).toBeTruthy()
  change(m.slack_app_token(), "xapp-test-app")
  fireEvent.click(screen.getByRole("button", { name: m.slack_setup_back() }))
  expect(screen.getByDisplayValue("xoxb-test-bot")).toBeTruthy()
  next()
  expect(await screen.findByDisplayValue("xapp-test-app")).toBeTruthy()
  next()
  await screen.findByLabelText(m.slack_client_id())
  change(m.slack_client_id(), "incorrect")
  fireEvent.click(screen.getByRole("button", { name: m.slack_connect() }))
  expect(await screen.findByText(m.slack_validation_client_id())).toBeTruthy()
  expect(screen.getByText(m.slack_validation_client_secret())).toBeTruthy()
  expect(mocks.save).not.toHaveBeenCalled()
  change(m.slack_client_id(), "123.456")
  change(m.slack_client_secret(), "test-client-secret")
  fireEvent.click(screen.getByRole("button", { name: m.slack_connect() }))
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({
      botToken: "xoxb-test-bot",
      appToken: "xapp-test-app",
      clientId: "123.456",
      clientSecret: "test-client-secret"
    })
  )
  await waitFor(() =>
    expect(screen.queryByDisplayValue("test-client-secret")).toBeNull()
  )
  view.rerender(<SlackConnectionForm orgSlug="example" status={connected} />)
  expect(screen.queryByLabelText(m.slack_client_secret())).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: m.slack_replace() }))
  expect(screen.queryByDisplayValue("xoxb-test-bot")).toBeNull()
})

it("starts credential updates at the token step and clears the draft on cancel", async () => {
  render(<SlackConnectionForm orgSlug="example" status={connected} />)
  fireEvent.click(screen.getByRole("button", { name: m.slack_replace() }))
  expect(
    screen.getByText(m.slack_setup_progress({ current: 1, total: 3 }))
  ).toBeTruthy()
  change(m.slack_bot_token(), "xoxb-cancelled-draft")
  next()
  await screen.findByLabelText(m.slack_app_token())
  fireEvent.click(
    screen.getByRole("button", { name: m.common_cancel_button() })
  )
  expect(screen.queryByLabelText(m.slack_app_token())).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: m.slack_replace() }))
  expect(screen.queryByDisplayValue("xoxb-cancelled-draft")).toBeNull()
  expect(mocks.save).not.toHaveBeenCalled()
})

it("retains the entered credentials when Slack rejects the connection", async () => {
  mocks.save.mockResolvedValue(Exit.fail(new SlackAuthInvalid()))
  render(<SlackConnectionForm orgSlug="example" status={connected} />)
  fireEvent.click(screen.getByRole("button", { name: m.slack_replace() }))
  change(m.slack_bot_token(), "xoxb-retry-bot")
  next()
  await screen.findByLabelText(m.slack_app_token())
  change(m.slack_app_token(), "xapp-retry-app")
  next()
  await screen.findByLabelText(m.slack_client_secret())
  change(m.slack_client_secret(), "retry-client-secret")
  fireEvent.click(screen.getByRole("button", { name: m.slack_connect() }))
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
  expect(screen.getByDisplayValue("retry-client-secret")).toBeTruthy()
  fireEvent.click(screen.getByRole("button", { name: m.slack_setup_back() }))
  expect(screen.getByDisplayValue("xapp-retry-app")).toBeTruthy()
})

it("returns to app creation after the workspace is disconnected", async () => {
  const view = render(
    <SlackConnectionForm orgSlug="example" status={connected} />
  )
  fireEvent.click(screen.getByRole("button", { name: m.slack_disconnect() }))
  fireEvent.click(screen.getByRole("button", { name: m.slack_disconnect() }))
  await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
  view.rerender(
    <SlackConnectionForm orgSlug="example" status={{ connection: null }} />
  )
  expect(
    await screen.findByText(m.slack_setup_progress({ current: 1, total: 4 }))
  ).toBeTruthy()
  expect(screen.getByText(m.slack_setup_create_title())).toBeTruthy()
})
