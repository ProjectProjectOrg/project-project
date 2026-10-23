import { it } from "@effect/vitest"
import { SlackClient } from "@pp/integration-slack/Client"
import { ticketPreview } from "@pp/integration-slack/messages"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Schema from "effect/Schema"
import { expect } from "vitest"

it.effect("passes the bot ID to Slack's read endpoint", () => {
  const fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request =
        input instanceof Request
          ? new Request(input, init)
          : new Request(String(input), init)
      const arguments_ = request.headers
        .get("Content-Type")
        ?.startsWith("application/x-www-form-urlencoded")
        ? new URLSearchParams(await request.text())
        : new URL(request.url).searchParams
      return Response.json(
        arguments_.get("bot") === "B123"
          ? { ok: true, bot: { app_id: "A456" } }
          : { ok: true }
      )
    },
    { preconnect: () => undefined }
  )

  return Effect.gen(function* () {
    const client = yield* SlackClient
    expect(yield* client.appId("test-bot-token", "B123")).toBe("A456")
  }).pipe(
    Effect.provide(SlackClient.layer),
    Effect.provideService(FetchHttpClient.Fetch, fetch)
  )
})

it.effect(
  "sends ticket previews without mixing legacy text and Block Kit",
  () => {
    let body: unknown
    const fetch = Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const request =
          input instanceof Request
            ? new Request(input, init)
            : new Request(String(input), init)
        body = await request.json()
        return Response.json({ ok: true })
      },
      { preconnect: () => undefined }
    )
    const url = "https://pp.example.test/orgs/org/projects/project/tickets/T-1"

    return Effect.gen(function* () {
      const client = yield* SlackClient
      yield* client.unfurl(
        "test-bot-token",
        { channel: "C123", ts: "1.000001" },
        {
          [url]: ticketPreview({
            id: "T-1",
            title: "A ticket",
            status: "Todo",
            assignees: []
          })
        }
      )
      const payload = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          unfurls: Schema.Record(
            Schema.String,
            Schema.Record(Schema.String, Schema.Unknown)
          )
        })
      )(body)
      expect(payload.unfurls[url]).not.toHaveProperty("text")
      expect(payload.unfurls[url]?.blocks).toEqual(expect.any(Array))
    }).pipe(
      Effect.provide(SlackClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch)
    )
  }
)
