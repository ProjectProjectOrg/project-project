// MCP tool catalog. Declared in `shared` so backend handlers and frontend
// tooling read from one source of truth — the same way `HttpApi` is declared
// here. Each entry pairs a description with input/output Schemas and the
// tagged errors the handler may produce. The backend's generic dispatcher
// (packages/backend/src/mcp/dispatch.ts) walks this object and registers
// every tool against the SDK; the handler map keys match the keys here.

import * as Schema from "effect/Schema"
import { Unauthorized } from "../errors"
import { MeOutput } from "./MeOutput"

// Re-exports so consumers can `import { Pagination, MeOutput } from "@projectproject/shared"`.
export * from "./Pagination"
export * from "./cursor"
export * from "./MeOutput"
export * from "./filters/Ticket"

export interface McpToolSpec<
  Input extends Schema.Schema.Any,
  Output extends Schema.Schema.Any,
  Errors extends ReadonlyArray<Schema.Schema.Any>,
> {
  readonly description: string
  readonly input: Input
  readonly output: Output
  readonly errors: Errors
}

export const McpTools = {
  me: {
    description: "Identity of the authed user and their org/project roles.",
    input: Schema.Struct({}),
    output: MeOutput,
    errors: [Unauthorized] as const,
  },
} as const satisfies Record<string, McpToolSpec<any, any, any>>

export type McpToolName = keyof typeof McpTools
