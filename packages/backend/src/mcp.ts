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
import { Effect, Layer, ManagedRuntime } from "effect"
import { z } from "zod"
import { session } from "./db/schema"
import { Db, DbLive } from "./services/Db"
import { GitHub } from "./services/GitHub"
import { BetterAuthLive } from "./services/BetterAuth"
import { Markdown } from "./services/Markdown"
import { Projects } from "./services/Projects"
import { Tickets } from "./services/Tickets"
import { Users } from "./services/Users"

// --- Auth ------------------------------------------------------------------

async function resolveUserId(token: string): Promise<string> {
  const db = drizzle(process.env.DATABASE_URL!)
  const rows = await db
    .select({ userId: session.userId })
    .from(session)
    .where(and(eq(session.token, token), gt(session.expiresAt, new Date())))
    .limit(1)
  if (rows.length === 0) {
    throw new Error(
      "MARKMATE_MCP_TOKEN is invalid or expired. Sign in via the web UI " +
        "and copy a fresh session token."
    )
  }
  return rows[0].userId
}

// --- Runtime ---------------------------------------------------------------
// Mirror of `main.ts`'s service graph, minus the HTTP layers. Each service
// declares its dependencies via `Effect.Service`'s reads, but `Effect.Service`
// doesn't auto-wire siblings — we have to chain `provideMerge` so each
// upstream service finds its dependencies further down.
//
// Order: Tickets → Projects → GitHub → Markdown → Users, then BetterAuth +
// Db at the bottom for the others to see. `provideMerge` (vs `provide`)
// keeps every layer in the exposed surface so the runtime can resolve any
// of them at the top level.

const ServicesLayer = Tickets.Default.pipe(
  Layer.provideMerge(Projects.Default),
  Layer.provideMerge(GitHub.Default),
  Layer.provideMerge(Users.Default),
  Layer.provideMerge(Markdown.Default),
  Layer.provideMerge(BetterAuthLive),
  Layer.provideMerge(DbLive)
)

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

  const runtime = ManagedRuntime.make(ServicesLayer)
  const run = <A, E>(eff: Effect.Effect<A, E, Projects | Tickets | Db>) =>
    runtime.runPromise(eff as Effect.Effect<A, E, never>)

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
        "slug, name, ownerId, createdAt for each.",
      inputSchema: {}
    },
    async () => {
      try {
        const projects = await run(
          Effect.gen(function* () {
            const svc = yield* Projects
            return yield* svc.list(userId)
          })
        )
        return asJson(projects)
      } catch (e) {
        return asError(`list_projects failed: ${String(e)}`)
      }
    }
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
    async ({ slug }) => {
      try {
        const detail = await run(
          Effect.gen(function* () {
            const svc = yield* Projects
            return yield* svc
              .get(userId, slug)
              .pipe(Effect.catchTag("MarkdownError", (e) => Effect.die(e)))
          })
        )
        return asJson(detail)
      } catch (e) {
        return asError(`get_project failed: ${describeError(e)}`)
      }
    }
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
    async ({ slug, status, type, assignee, has_branch, has_pr }) => {
      try {
        const tickets = await run(
          Effect.gen(function* () {
            const svc = yield* Tickets
            return yield* svc
              .list(userId, slug)
              .pipe(Effect.catchTag("MarkdownError", (e) => Effect.die(e)))
          })
        )
        const filtered = tickets.filter((t) => {
          if (status && t.status !== status) return false
          if (type && t.type !== type) return false
          if (assignee !== undefined) {
            if (assignee === null) {
              if (t.assignees.length > 0) return false
            } else if (!t.assignees.includes(assignee)) {
              return false
            }
          }
          if (has_branch !== undefined && (t.branch !== null) !== has_branch) {
            return false
          }
          if (has_pr !== undefined && (t.pr !== null) !== has_pr) return false
          return true
        })
        return asJson(filtered)
      } catch (e) {
        return asError(`list_tickets failed: ${describeError(e)}`)
      }
    }
  )

  // --- get_ticket ----------------------------------------------------------
  server.registerTool(
    "get_ticket",
    {
      title: "Get ticket",
      description: "Returns the full ticket: frontmatter + body (markdown).",
      inputSchema: { slug: z.string(), id: z.string() }
    },
    async ({ slug, id }) => {
      try {
        const ticket = await run(
          Effect.gen(function* () {
            const svc = yield* Tickets
            return yield* svc
              .get(userId, slug, id)
              .pipe(Effect.catchTag("MarkdownError", (e) => Effect.die(e)))
          })
        )
        return asJson(ticket)
      } catch (e) {
        return asError(`get_ticket failed: ${describeError(e)}`)
      }
    }
  )

  // --- Connect transport ---------------------------------------------------
  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Tear down the runtime on transport close.
  transport.onclose = () => {
    void runtime.dispose().finally(() => process.exit(0))
  }
}

function describeError(e: unknown): string {
  if (typeof e === "object" && e && "_tag" in e) {
    return String(e._tag)
  }
  return String(e)
}

main().catch((e) => {
  console.error("MCP server failed to start:", e)
  process.exit(1)
})
