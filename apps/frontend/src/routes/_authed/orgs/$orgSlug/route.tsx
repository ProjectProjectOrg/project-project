import { createFileRoute } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Registry from "effect/reactivity/AtomRegistry"

import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { OrgLayout } from "@/features/organizations/components/OrgLayout"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"

export const Route = createFileRoute("/_authed/orgs/$orgSlug")({
  component: OrgLayout,
  loader: async ({ context: { registry }, params, abortController }) => {
    const projects = Effect.runPromiseExit(
      Registry.getResult(
        registry,
        projectsFor(projectsRequest(params.orgSlug))
      ),
      { signal: abortController.signal }
    )
    await Effect.runPromiseExit(
      Registry.getResult(registry, orgDetail(orgRequest(params.orgSlug))),
      {
        signal: abortController.signal
      }
    )
    await projects
  }
})
