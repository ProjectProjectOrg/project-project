// packages/backend/src/mcp.ts
//
// MCP entry point — stdio transport.
//
// HOW IT'S USED
// ============================================================================
// The user runs this as a subprocess from their AI agent (Claude Code,
// Cursor, etc.). The agent's MCP config points to:
//
//   command: "bun",
//   args: ["run", "src/mcp.ts"],
//   cwd: "<repo>/packages/backend",
//   env: {
//     DATABASE_URL: "...",
//     PROJECTS_DIR: "...",
//     MARKMATE_MCP_TOKEN: "<better-auth session token>"
//   }
//
// AUTH
// ============================================================================
// `MARKMATE_MCP_TOKEN` is a Better Auth session token. We look it up in the
// `session` table and resolve the `userId`. Same auth model as the web UI —
// no separate API-token table for v1. Trade-off: the token has the lifetime
// of a normal session, so the user has to refresh it occasionally.
//
// SCOPE OF THIS V1
// ============================================================================
// Read-only tools that don't depend on GitHub or the not-yet-built Docs
// feature: `me`, `list_projects`, `get_project`, `list_tickets`,
// `get_ticket`. HTTP transport, resources, and `git_state` come in v2.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { drizzle } from "drizzle-orm/node-postgres"
import { and, eq, gt } from "drizzle-orm"
import { Cause, Effect, Exit, ManagedRuntime, Option } from "effect"
import { z } from "zod"
import * as schema from "./db/schema"
import { session } from "./db/schema"
import { BackendRuntimeLive } from "./runtime"
import { Projects } from "./Services/Projects"
import { Tickets } from "./Services/Tickets"

// MCP tokens are user-scoped today; org scoping happens server-side via
// this fallback. Per design spec Q12, future tokens will be org-scoped at
// issue time and this constant goes away.
const org = process.env.MARKMATE_MCP_ORG ?? "project-project"

// --- Auth ------------------------------------------------------------------

async function resolveUserId(token: string): Promise<string> {
  const db = drizzle(process.env.DATABASE_URL!, { schema })
  const row = await db.query.session.findFirst({
    columns: { userId: true },
    where: and(eq(session.token, token), gt(session.expiresAt, new Date()))
  })
  if (!row) {
    throw new Error(
      "MARKMATE_MCP_TOKEN is invalid or expired. Sign in via the web UI " +
        "and copy a fresh session token."
    )
  }
  return row.userId
}

// --- Tool body helpers -----------------------------------------------------

function asJson(value: unknown): {
  content: { type: "text"; text: string }[]
} {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  }
}

function asError(message: string): {
  content: { type: "text"; text: string }[]
  isError: true
} {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true
  }
}

type TaggedFailure = { readonly _tag: string }

function describeCause<E extends TaggedFailure>(cause: Cause.Cause<E>): string {
  const failure = Cause.failureOption(cause)
  return Option.isNone(failure) ? Cause.pretty(cause) : failure.value._tag
}

// --- Main ------------------------------------------------------------------

async function main(): Promise<void> {
  const token = process.env.MARKMATE_MCP_TOKEN
  if (!token) {
    console.error(
      "MARKMATE_MCP_TOKEN is not set. The MCP server needs a Better Auth " +
        "session token to scope reads to one user."
    )
    process.exit(1)
  }

  const userId = await resolveUserId(token)

  const runtime = ManagedRuntime.make(BackendRuntimeLive)
  const run = <A, E>(eff: Effect.Effect<A, E, Projects | Tickets>) =>
    runtime.runPromiseExit(eff as Effect.Effect<A, E, never>)
  const runTool = async <A, E extends TaggedFailure>(
    name: string,
    eff: Effect.Effect<A, E, Projects | Tickets>
  ) =>
    Exit.match(await run(eff), {
      onSuccess: asJson,
      onFailure: (cause) => asError(`${name} failed: ${describeCause(cause)}`)
    })

  const server = new McpServer(
    { name: "markmate", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Read-only access to the user's ProjectProject projects and tickets. " +
        "Use these tools to gather context before suggesting code or writing tickets."
    }
  )

  // --- me ------------------------------------------------------------------
  server.registerTool(
    "me",
    {
      title: "Who am I",
      description: "Returns the authed user's id.",
      inputSchema: {}
    },
    async () => asJson({ userId })
  )

  // --- list_projects -------------------------------------------------------
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "Lists every project the authed user is a member of. Returns " +
        "slug, name, createdBy, createdAt for each.",
      inputSchema: {}
    },
    async () =>
      runTool(
        "list_projects",
        Effect.gen(function* () {
          const svc = yield* Projects
          return yield* svc.list(org, userId)
        })
      )
  )

  // --- get_project ---------------------------------------------------------
  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description:
        "Returns the full project: name, body (markdown), members, and " +
        "the GitHub connection if any. Errors with NotFound if the user " +
        "isn't a member.",
      inputSchema: { slug: z.string() }
    },
    async ({ slug }) =>
      runTool(
        "get_project",
        Effect.gen(function* () {
          const svc = yield* Projects
          return yield* svc.get(org, userId, slug)
        })
      )
  )

  // --- list_tickets --------------------------------------------------------
  server.registerTool(
    "list_tickets",
    {
      title: "List tickets",
      description:
        "Lists tickets in a project. Optional filters: status, type, " +
        "assignee, has_branch, has_pr.",
      inputSchema: {
        slug: z.string(),
        status: z
          .enum(["todo", "in_progress", "done"])
          .optional()
          .describe("Filter by status."),
        type: z
          .enum(["feat", "bug", "chore", "other"])
          .optional()
          .describe("Filter by ticket type."),
        assignee: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Filter by assignee user id (matches if assigned), or null for unassigned tickets."
          ),
        has_branch: z.boolean().optional(),
        has_pr: z.boolean().optional()
      }
    },
    async ({ slug, status, type, assignee, has_branch, has_pr }) =>
      runTool(
        "list_tickets",
        Effect.gen(function* () {
          const svc = yield* Tickets
          const tickets = yield* svc.list(org, userId, slug)
          return tickets.filter((t) => {
            if (status && t.status !== status) return false
            if (type && t.type !== type) return false
            if (assignee !== undefined) {
              if (assignee === null) {
                if (t.assignees.length > 0) return false
              } else if (!t.assignees.includes(assignee)) {
                return false
              }
            }
            if (
              has_branch !== undefined &&
              (t.branch !== null) !== has_branch
            ) {
              return false
            }
            if (has_pr !== undefined && (t.pr !== null) !== has_pr) return false
            return true
          })
        })
      )
  )

  // --- get_ticket ----------------------------------------------------------
  server.registerTool(
    "get_ticket",
    {
      title: "Get ticket",
      description: "Returns the full ticket: frontmatter + body (markdown).",
      inputSchema: { slug: z.string(), id: z.string() }
    },
    async ({ slug, id }) =>
      runTool(
        "get_ticket",
        Effect.gen(function* () {
          const svc = yield* Tickets
          return yield* svc.get(org, userId, slug, id)
        })
      )
  )

  // --- Connect transport ---------------------------------------------------
  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Tear down the runtime on transport close.
  transport.onclose = () => {
    void runtime.dispose().finally(() => process.exit(0))
  }
}

main().catch((e) => {
  console.error("MCP server failed to start:", e)
  process.exit(1)
})
