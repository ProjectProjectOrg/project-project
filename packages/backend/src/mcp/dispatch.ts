// packages/backend/src/mcp/dispatch.ts
//
// Generic adapter: walks the shared `McpTools` catalog and registers each
// entry on the SDK's `McpServer`. Each tool's input/output schemas come from
// the catalog (Effect Schema), and we pass them through Standard Schema v1 so
// the SDK can validate without a Zod conversion. Errors raised inside a
// handler's Effect get mapped to MCP tool-error responses via `mapToolError`
// inside the Effect pipeline, so the error channel collapses to `never` by
// the time we hand the program to the runtime.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import * as Effect from "effect/Effect"
import type * as ManagedRuntime from "effect/ManagedRuntime"
import * as Schema from "effect/Schema"
import { z } from "zod"
import { McpTools, type McpToolName } from "@projectproject/shared"
import { mapToolError, type McpToolErrorResult } from "./errorMap"

const PassthroughInputSchema = z.looseObject({})

// The dispatcher is intentionally generic: per-tool input/output/error types
// are validated at the boundary via Effect Schema, so the internal handler
// signature here is necessarily wide. The `any`s are contained to this file.
// `R` is the requirements channel the surrounding `ManagedRuntime` will
// satisfy — handlers declare whatever services they pull (CurrentUser,
// Users, Tickets, …) and the registerAllTools caller picks an `R` that
// covers all of them.
type AnyHandler<R> = (input: any) => Effect.Effect<unknown, unknown, R>
export type HandlersMap<R> = { readonly [K in McpToolName]: AnyHandler<R> }

type JsonContentResult = {
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>
}

const asJsonContent = (value: unknown): JsonContentResult => ({
  content: [
    { type: "text" as const, text: JSON.stringify(value, null, 2) },
  ],
})

export function registerAllTools<R>(
  server: McpServer,
  runtime: ManagedRuntime.ManagedRuntime<R, never>,
  handlers: HandlersMap<R>,
): void {
  for (const name of Object.keys(McpTools) as Array<McpToolName>) {
    const spec = McpTools[name]
    const handler = handlers[name]

    // The SDK only accepts Zod schemas for inputSchema. Without one, it passes
    // `undefined` to the callback instead of the call args. We register a
    // permissive loose-object schema so all properties flow through; the real
    // shape validation happens via Effect Schema below.
    server.registerTool(
      name,
      {
        description: spec.description,
        inputSchema: PassthroughInputSchema,
      },
      (async (input: unknown) => {
        // Collapse the error channel to `never` by mapping any failure to a
        // tool-error response inline, so runPromise resolves with the union.
        const program: Effect.Effect<JsonContentResult | McpToolErrorResult, never, R> =
          (Schema.decodeUnknown(spec.input as Schema.Schema<unknown, unknown, never>)(input) as Effect.Effect<unknown, unknown, never>).pipe(
            Effect.flatMap((parsed) => handler(parsed) as Effect.Effect<unknown, unknown, R>),
            Effect.flatMap((out) =>
              Schema.encode(spec.output as Schema.Schema<unknown, unknown, never>)(out),
            ),
            Effect.map(asJsonContent),
            Effect.catchAll((e) => Effect.succeed(mapToolError(e))),
            Effect.catchAllDefect((e) => Effect.succeed(mapToolError(e))),
          )
        return await runtime.runPromise(program)
      }) as any,
    )
  }
}
