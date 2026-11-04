import { PgClient } from "@effect/sql-pg"
import { DbLive } from "@pp/db"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"

import * as Access from "../access/Access"
import * as GitHub from "../github/GitHub"
import type * as ProjectGithub from "../github/ProjectGithub"
import * as TicketIndexServices from "../tickets/indexLayer"
import * as TicketDocs from "../tickets/TicketDocs"
import * as TicketDocumentLock from "../tickets/ticketDocumentLock"
import * as TicketIndex from "../tickets/TicketIndex"
import * as TicketRewrites from "../tickets/TicketRewrites"
import * as Users from "../users/Users"
import * as BannerPlaceholders from "./BannerPlaceholders"
import { FinishedStatuses } from "./FinishedStatuses"
import * as ProjectServices from "./layer"
import * as ProjectDocs from "./ProjectDocs"
import type * as ProjectMembers from "./ProjectMembers"
import type * as Projects from "./Projects"

const unused = () => Effect.die(new Error("Unexpected dependency call"))

export const projectsOnPostgres = (
  databaseUrl: string,
  userIds: ReadonlyArray<string>,
  ticketDocs: Partial<TicketDocs.TicketDocs["Service"]> = {},
  projectDocs?: Layer.Layer<ProjectDocs.ProjectDocs>,
  github: Partial<GitHub.GitHub["Service"]> = {}
): Layer.Layer<
  | Projects.Projects
  | ProjectGithub.ProjectGithub
  | ProjectMembers.ProjectMembers
  | TicketIndex.TicketIndex
  | TicketRewrites.TicketRewrites
  | Access.Access
> => {
  const db = DbLive.pipe(
    Layer.provideMerge(
      PgClient.layer({ url: Redacted.make(databaseUrl), maxConnections: 1 })
    )
  )
  const docs = Layer.succeed(TicketDocs.TicketDocs, {
    listIds: () => Effect.succeed([]),
    read: unused,
    write: unused,
    update: unused,
    create: unused,
    remove: unused,
    readRaw: unused,
    ...ticketDocs
  })
  const ticketIndex = TicketIndexServices.layer.pipe(
    Layer.provide(db),
    Layer.provide(docs)
  )
  const finishedStatuses = FinishedStatuses.layer.pipe(Layer.provide(db))
  const tickets = TicketRewrites.layer.pipe(
    Layer.provideMerge(ticketIndex),
    Layer.provide(docs),
    Layer.provide(TicketDocumentLock.layer),
    Layer.provide(finishedStatuses),
    Layer.provide(db)
  )
  return ProjectServices.layer.pipe(
    Layer.provideMerge(tickets),
    Layer.provideMerge(Access.layer.pipe(Layer.provide(db))),
    Layer.provide(db),
    Layer.provide(
      Layer.succeed(BannerPlaceholders.BannerPlaceholders, {
        ensure: (_org, _slug, current) => Effect.succeed(current)
      })
    ),
    Layer.provide(
      projectDocs ??
        Layer.succeed(ProjectDocs.ProjectDocs, {
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
              estimation: "off",
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
          markSystem: unused,
          systemRole: unused,
          removeDir: () => Effect.void,
          readRaw: unused
        })
    ),
    Layer.provide(
      Layer.succeed(Users.Users, {
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
      Layer.succeed(GitHub.GitHub, {
        verifyInstallationRepo: unused,
        listInstallationRepos: unused,
        createBranchAsUser: unused,
        openPullRequestAsUser: unused,
        fetchInstallationProjectStates: unused,
        listInstallationBranches: unused,
        branchExistsInstallation: unused,
        ...github
      })
    ),
    Layer.orDie
  )
}
