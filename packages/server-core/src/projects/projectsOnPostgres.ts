import { PgClient } from "@effect/sql-pg"
import { DbLive } from "@pp/db"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"

import { GitHub } from "../github/GitHub"
import { TicketDocs } from "../tickets/TicketDocs"
import * as TicketDocumentLock from "../tickets/ticketDocumentLock"
import { TicketIndex } from "../tickets/TicketIndex"
import { TicketIndexLive } from "../tickets/TicketIndexLive"
import { Users } from "../users/Users"
import { BannerPlaceholders } from "./BannerPlaceholders"
import { ProjectDocs } from "./ProjectDocs"
import type { Projects } from "./Projects"
import { ProjectsLive } from "./ProjectsLive"

const unused = () => Effect.die(new Error("Unexpected dependency call"))

export const projectsOnPostgres = (
  databaseUrl: string,
  userIds: ReadonlyArray<string>
): Layer.Layer<Projects | TicketIndex> => {
  const db = DbLive.pipe(
    Layer.provideMerge(
      PgClient.layer({ url: Redacted.make(databaseUrl), maxConnections: 1 })
    )
  )
  const docs = Layer.succeed(TicketDocs, {
    listIds: () => Effect.succeed([]),
    read: unused,
    write: unused,
    update: unused,
    create: unused,
    remove: unused,
    readRaw: unused
  })
  const ticketIndex = TicketIndexLive.pipe(
    Layer.provide(db),
    Layer.provide(docs)
  )
  return ProjectsLive.pipe(
    Layer.provideMerge(ticketIndex),
    Layer.provide(docs),
    Layer.provide(TicketDocumentLock.layer),
    Layer.provide(db),
    Layer.provide(
      Layer.succeed(BannerPlaceholders, {
        ensure: (_org, _slug, current) => Effect.succeed(current)
      })
    ),
    Layer.provide(
      Layer.succeed(ProjectDocs, {
        read: (_org, slug) =>
          Effect.succeed({
            slug,
            name: slug,
            icon: "folder",
            color: "#3b82f6",
            createdAt: DateTime.toDateUtc(
              DateTime.makeUnsafe("2026-09-24T00:00:00Z")
            ),
            github: null,
            setup: {
              workflowReviewedAt: null,
              invitePeopleDismissedAt: null,
              connectGithubDismissedAt: null
            },
            templateDefaults: {},
            body: "Project body"
          }),
        write: () => Effect.void,
        writeTemplateDefaults: unused,
        removeDir: () => Effect.void,
        readRaw: unused
      })
    ),
    Layer.provide(
      Layer.succeed(Users, {
        findByEmail: (email) =>
          Effect.succeed(
            userIds
              .filter((id) => `${id}@example.test` === email)
              .map((id) => ({ id, email, name: id, username: null }))[0] ?? null
          ),
        findManyByIds: unused,
        fullByIds: unused
      })
    ),
    Layer.provide(
      Layer.succeed(GitHub, {
        verifyInstallationRepo: unused,
        getInstallationAccount: unused,
        listInstallationRepos: unused,
        exchangeAppUserCode: unused,
        appUserCanAccessInstallation: unused,
        createBranchAsUser: unused,
        openPullRequestAsUser: unused,
        fetchInstallationProjectStates: unused,
        listInstallationBranches: unused,
        branchExistsInstallation: unused
      })
    ),
    Layer.orDie
  )
}
