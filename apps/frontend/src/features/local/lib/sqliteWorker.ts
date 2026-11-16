import * as OpfsWorker from "@effect/sql-sqlite-wasm/OpfsWorker"
import * as Effect from "effect/Effect"

addEventListener(
  "message",
  (event: MessageEvent<string>) => {
    const [port] = event.ports
    if (port === undefined) return
    Effect.runFork(OpfsWorker.run({ port, dbName: event.data }))
  },
  { once: true }
)
