import { describe, expect, test } from "vite-plus/test"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { HttpRouter } from "effect/unstable/http"
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/unstable/ai"
import type { User } from "@projectproject/shared"
import { McpRequestUser } from "../mcp/McpRequestUser"

const WhoAmI = Tool.make("who_am_i", {
  success: Schema.Struct({ id: Schema.String })
})
const toolkit = Toolkit.make(WhoAmI)

const Handlers = toolkit.toLayer({
  who_am_i: () =>
    Effect.map(McpRequestUser, (user) => ({
      id: Option.match(user, { onNone: () => "nobody", onSome: (u) => u.id })
    }))
})

const SetUser = HttpRouter.middleware((effect) =>
  Effect.provideService(
    effect,
    McpRequestUser,
    Option.some({ id: "u-42" } as User)
  )
).layer

const Mcp = McpServer.layerHttp({
  name: "spike",
  version: "0",
  path: "/mcp",
  protocols: [McpProtocol.v2026_07_28]
}).pipe(
  Layer.provideMerge(McpServer.toolkit(toolkit)),
  Layer.provide(Handlers),
  Layer.provide(SetUser)
)

const meta = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "spike", version: "0" },
  "io.modelcontextprotocol/clientCapabilities": {}
}

describe("middleware value reaches tool handlers", () => {
  test("who_am_i sees the user set by the route middleware", async () => {
    const { handler, dispose } = HttpRouter.toWebHandler(Mcp, {
      disableLogger: true
    })
    const response = await handler(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": "2026-07-28",
          "mcp-method": "tools/call",
          "mcp-name": "who_am_i"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "who_am_i", arguments: {}, _meta: meta }
        })
      })
    )
    const body = (await response.json()) as {
      readonly result: {
        readonly isError: boolean
        readonly content: ReadonlyArray<{ readonly text: string }>
      }
    }
    await dispose()
    expect(response.status).toBe(200)
    expect(body.result.isError).toBe(false)
    expect(body.result.content[0].text).toContain("u-42")
  })
})
