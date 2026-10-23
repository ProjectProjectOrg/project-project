import { expect, test } from "bun:test"

import { LogLevel, SocketModeClient } from "@slack/socket-mode"
import type { ServerWebSocket } from "bun"

test("keeps Socket Mode connected through heartbeat checks and acknowledges events", async () => {
  const sockets = new Set<ServerWebSocket>()
  let connections = 0
  const acknowledgement = Promise.withResolvers<unknown>()
  const server = Bun.serve({
    port: 0,
    fetch(request, server) {
      if (new URL(request.url).pathname === "/socket") {
        if (server.upgrade(request)) return
        return new Response(null, { status: 400 })
      }
      return Response.json({
        ok: true,
        url: `ws://127.0.0.1:${server.port}/socket`
      })
    },
    websocket: {
      open(socket) {
        sockets.add(socket)
        connections += 1
        socket.send(JSON.stringify({ type: "hello", num_connections: 1 }))
      },
      message(_socket, message) {
        const payload: unknown = JSON.parse(String(message))
        acknowledgement.resolve(payload)
      },
      close(socket) {
        sockets.delete(socket)
      }
    }
  })
  const client = new SocketModeClient({
    appToken: "xapp-local-test",
    logLevel: LogLevel.ERROR,
    clientOptions: {
      slackApiUrl: `http://127.0.0.1:${server.port}/`,
      retryConfig: { retries: 0 },
      timeout: 1_000
    }
  })
  client.on(
    "slack_event",
    ({ ack }: Readonly<{ ack: () => Promise<void> }>) => {
      void ack()
    }
  )

  try {
    await client.start()
    await Bun.sleep(9_000)
    expect(connections).toBe(1)
    for (const socket of sockets) {
      socket.send(
        JSON.stringify({
          type: "events_api",
          envelope_id: "heartbeat-check",
          payload: { event: { type: "link_shared" } }
        })
      )
    }
    expect(await acknowledgement.promise).toMatchObject({
      envelope_id: "heartbeat-check"
    })
  } finally {
    await client.disconnect()
    await server.stop(true)
  }
}, 20_000)
