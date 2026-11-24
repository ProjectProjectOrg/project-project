import { TicketId } from "@pp/shared"
import { createFileRoute } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import {
  everhourProjectRequest,
  everhourProjectStatusAtom
} from "@/features/everhour/atoms/everhour"
import {
  projectLibraryFor,
  projectLibraryRequest
} from "@/features/library/atoms/library"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { orgStorage, storageRequest } from "@/features/projects/atoms/storage"
import {
  sprintDetail,
  sprintRequest
} from "@/features/sprints/atoms/sprintDetail"
import { tagEditor, tagEditorRequest } from "@/features/tags/atoms/tags"
import {
  ticketActivity,
  ticketActivityRequest
} from "@/features/tickets/atoms/ticketActivity"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import {
  ticketSequence,
  ticketSequenceRequest
} from "@/features/tickets/atoms/ticketSequence"
import { TicketDetail } from "@/features/tickets/components/ticket-page/TicketDetail"
import {
  sprintFromSearch,
  TicketDetailSearch,
  ticketSourceFromSearch
} from "@/features/tickets/lib/ticketSearch"
import { m } from "@/paraglide/messages"

const decodeTicketId = Schema.decodeUnknownSync(TicketId)

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/tickets/$id"
)({
  component: TicketDetail,
  validateSearch: Schema.toStandardSchemaV1(TicketDetailSearch),
  loaderDeps: ({ search }) => ({
    from: ticketSourceFromSearch(search),
    sprint: sprintFromSearch(search)
  }),
  loader: async ({
    context: { registry },
    params,
    deps,
    location,
    abortController
  }) => {
    const { orgSlug, slug } = params
    const id = decodeTicketId(params.id)
    const ticket = Crumb.ticket({
      orgSlug: params.orgSlug,
      slug: params.slug,
      id
    })
    const crumb =
      deps.sprint === undefined
        ? ticket
        : [
            Crumb.static({
              label: m.project_detail_tab_sprints(),
              to: "/orgs/$orgSlug/projects/$slug/sprints",
              params: { orgSlug: params.orgSlug, slug: params.slug }
            }),
            Crumb.sprint({
              orgSlug: params.orgSlug,
              slug: params.slug,
              groupId: deps.sprint
            }),
            ticket
          ]
    if (location.state.ticketStep === true) return { crumb }
    registry.mount(
      ticketSequence(
        ticketSequenceRequest(
          params.orgSlug,
          params.slug,
          id,
          Predicate.isTagged(deps.from, "parent") ? undefined : deps.from
        )
      )
    )()
    if (deps.sprint !== undefined) {
      registry.mount(
        sprintDetail(sprintRequest(params.orgSlug, params.slug, deps.sprint))
      )()
    }
    registry.mount(comments(commentsRequest(params.orgSlug, params.slug, id)))()
    registry.mount(
      ticketActivity(ticketActivityRequest(params.orgSlug, params.slug, id))
    )()
    registry.mount(orgStorage(storageRequest(orgSlug)))()
    registry.mount(orgDetail(orgRequest(orgSlug)))()
    registry.mount(
      everhourProjectStatusAtom(
        everhourProjectRequest(params.orgSlug, params.slug)
      )
    )()
    await Effect.runPromiseExit(
      Effect.all(
        [
          Registry.getResult(
            registry,
            ticketDetail(ticketRequest(orgSlug, slug, id))
          ),
          Registry.getResult(registry, project(projectRequest(orgSlug, slug))),
          Effect.exit(
            Registry.getResult(
              registry,
              statusesFor(statusesRequest(orgSlug, slug))
            )
          ),
          Effect.exit(
            Registry.getResult(
              registry,
              projectLibraryFor(projectLibraryRequest(orgSlug, slug))
            )
          ),
          Effect.exit(
            Registry.getResult(
              registry,
              tagEditor(tagEditorRequest(orgSlug, slug, id))
            )
          )
        ],
        { concurrency: "unbounded" }
      ),
      { signal: abortController.signal }
    )
    return { crumb }
  }
})
