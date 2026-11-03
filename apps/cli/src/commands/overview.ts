import { pickActiveSprint, Tools } from "@pp/shared"
import { Command } from "effect/cli"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

import { callToolAs } from "../client/callTool"
import { printResult } from "../output/format"
import { withLoading } from "../output/loading"
import { drawOverview, summarize } from "../output/overview"
import { animate } from "../output/reveal"
import { stdoutTerminal } from "../output/terminal"
import { allPages, currentServer, resolveOrg, resolveProject } from "./context"
import { root } from "./root"

const page = (cursor: string | undefined) =>
  cursor === undefined ? { limit: 200 } : { limit: 200, cursor }

export const overviewCommand = Command.make("overview", {}, () =>
  Effect.gen(function* () {
    const flags = yield* root
    const server = yield* currentServer
    const org = yield* resolveOrg(server)
    const project = yield* resolveProject(server, Option.some(org))
    const scope = { orgSlug: org.value, projectSlug: project.value }
    const [statuses, sprints, tickets] = yield* Effect.all(
      [
        callToolAs(
          server,
          "list_statuses",
          scope,
          Tools.tools.list_statuses.successSchema
        ),
        allPages((cursor) =>
          callToolAs(
            server,
            "list_sprints",
            { ...scope, state: "active", ...page(cursor) },
            Tools.tools.list_sprints.successSchema
          )
        ),
        allPages((cursor) =>
          callToolAs(
            server,
            "list_tickets",
            { ...scope, ...page(cursor) },
            Tools.tools.list_tickets.successSchema
          )
        )
      ],
      { concurrency: "unbounded" }
    ).pipe(withLoading(`Reading ${org.value}/${project.value}`))
    const now = DateTime.setZone(yield* DateTime.now, DateTime.zoneMakeLocal())
    const overview = summarize({
      scope: `${org.value}/${project.value}`,
      statuses: statuses.statuses,
      tickets,
      sprint: pickActiveSprint(sprints, DateTime.toDateUtc(now)) ?? undefined,
      now
    })
    if (flags.json) return yield* printResult(overview, true)
    const terminal = stdoutTerminal()
    const who = { server: server.origin, user: server.user.name }
    yield* animate(
      (progress) => drawOverview(overview, who, terminal, progress),
      terminal
    )
  })
).pipe(
  Command.withDescription(
    "A picture of the current project: the running sprint, tickets by status, and tickets created over the last 12 weeks."
  )
)
