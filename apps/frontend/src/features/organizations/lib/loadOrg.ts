import * as Effect from "effect/Effect"
import * as Registry from "effect/reactivity/AtomRegistry"

import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"

// Loads an org and its projects before anything under it renders.
export async function loadOrg(
  registry: Registry.AtomRegistry,
  orgSlug: string,
  signal: AbortSignal
) {
  const projects = Effect.runPromiseExit(
    Registry.getResult(registry, projectsFor(projectsRequest(orgSlug))),
    { signal }
  )
  await Effect.runPromiseExit(
    Registry.getResult(registry, orgDetail(orgRequest(orgSlug))),
    { signal }
  )
  await projects
}
