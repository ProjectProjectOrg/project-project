import {
  ProjectScope,
  type TicketDetail,
  type User,
  extractAttachmentRefs
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import * as Attachments from "../attachments/Attachments"
import * as ProjectGithub from "../projects/ProjectGithub"
import { Users } from "../users/Users"
import * as TicketDocs from "./TicketDocs"
import {
  documentToDetail,
  type GitView,
  type TicketReadError
} from "./ticketPresentation"
import type { TicketProject } from "./ticketProject"

export class TicketView extends Context.Service<
  TicketView,
  Readonly<{
    gitViewOf: (scope: ProjectScope["Service"]) => Effect.Effect<GitView>
    gitView: Effect.Effect<GitView, never, ProjectScope>
    readTicket: (
      project: TicketProject,
      id: string
    ) => Effect.Effect<TicketDocs.TicketDocument, TicketReadError>
    detailOf: (
      document: TicketDocs.TicketDocument,
      view: GitView,
      branchDeletedAt?: Date | null
    ) => Effect.Effect<TicketDetail>
    withMissingAttachments: (
      orgSlug: string,
      detail: TicketDetail
    ) => Effect.Effect<TicketDetail>
  }>
>()("@pp/server-core/tickets/TicketView") {}

const make = Effect.gen(function* () {
  const ticketDocs = yield* TicketDocs.TicketDocs
  const projectGithubLinks = yield* ProjectGithub.ProjectGithub
  const attachments = yield* Attachments.Attachments
  const users = yield* Users

  const gitViewOf = Effect.fn("TicketView.gitViewOf")(function* (
    scope: ProjectScope["Service"]
  ) {
    if (!scope.permissions.can({ github: ["read"] })) {
      return { integration: null, visible: false } satisfies GitView
    }
    const integration = yield* projectGithubLinks
      .integration()
      .pipe(Effect.provideService(ProjectScope, scope))
    return { integration, visible: true } satisfies GitView
  })

  const gitView = Effect.flatMap(ProjectScope, gitViewOf)

  const detailOf = Effect.fn("TicketView.detailOf")(function* (
    document: TicketDocs.TicketDocument,
    view: GitView,
    branchDeletedAt: Date | null = null
  ) {
    const found = yield* users.fullByIds([
      ...new Set([document.createdBy, document.updatedBy])
    ])
    const byId = new Map<string, User>(found.map((user) => [user.id, user]))
    return documentToDetail(
      document,
      view,
      byId.get(document.createdBy) ?? null,
      byId.get(document.updatedBy) ?? null,
      branchDeletedAt
    )
  })

  const readTicket = Effect.fn("TicketView.readTicket")(function* (
    project: TicketProject,
    id: string
  ) {
    return yield* ticketDocs.read(project.orgSlug, project.slug, id)
  })

  const withMissingAttachments = Effect.fn("TicketView.withMissingAttachments")(
    function* (orgSlug: string, detail: TicketDetail) {
      const missingAttachments = yield* attachments.missingIds(
        orgSlug,
        extractAttachmentRefs(detail.body)
          .filter((ref) => ref.orgSlug === orgSlug)
          .map((ref) => ref.id)
      )
      return { ...detail, missingAttachments }
    }
  )

  return TicketView.of({
    gitViewOf,
    gitView,
    readTicket,
    detailOf,
    withMissingAttachments
  })
})

export const layer = Layer.effect(TicketView, make)
