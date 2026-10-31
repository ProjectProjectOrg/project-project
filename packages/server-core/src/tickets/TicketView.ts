import {
  type ProjectScopeShape,
  ProjectScope,
  type TicketDetail,
  type User,
  extractAttachmentRefs
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { Attachments } from "../attachments/Attachments"
import { Projects } from "../projects/Projects"
import { Users } from "../users/Users"
import { TicketDocs, type TicketDocument } from "./TicketDocs"
import {
  documentToDetail,
  type GitView,
  type TicketReadError
} from "./ticketPresentation"
import type { TicketProject } from "./ticketProject"

export class TicketView extends Context.Service<
  TicketView,
  Readonly<{
    gitViewOf: (scope: ProjectScopeShape) => Effect.Effect<GitView>
    gitView: Effect.Effect<GitView, never, ProjectScope>
    readTicket: (
      project: TicketProject,
      id: string
    ) => Effect.Effect<TicketDocument, TicketReadError>
    detailOf: (
      document: TicketDocument,
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
  const ticketDocs = yield* TicketDocs
  const projects = yield* Projects
  const attachments = yield* Attachments
  const users = yield* Users

  const gitViewOf = Effect.fn("TicketView.gitViewOf")(function* (
    scope: ProjectScopeShape
  ) {
    if (!scope.permissions.can({ github: ["read"] })) {
      return { integration: null, visible: false } satisfies GitView
    }
    const integration = yield* projects
      .githubIntegration()
      .pipe(Effect.provideService(ProjectScope, scope))
    return { integration, visible: true } satisfies GitView
  })

  const gitView = Effect.flatMap(ProjectScope, gitViewOf)

  const detailOf = Effect.fn("TicketView.detailOf")(function* (
    document: TicketDocument,
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
