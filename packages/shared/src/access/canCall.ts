import { Org, Project } from "@pp/access/roles"
import * as Context from "effect/Context"
import * as Option from "effect/Option"
import {
  HttpApi,
  type HttpApiEndpoint,
  type HttpApiGroup
} from "effect/unstable/httpapi"

import { AppApi } from "../api"
import type { OrgRole } from "../schemas/Org"
import type { ProjectPermissions } from "../schemas/Project"
import { type OrgRequirement, RequiresOrg } from "./OrgAccess"
import { type ProjectRequirement, RequiresProject } from "./ProjectAccess"
import { permits } from "./Requirement"

type Groups =
  typeof AppApi extends HttpApi.HttpApi<infer _Id, infer G> ? G : never

export type GroupName = HttpApiGroup.Identifier<Groups>

export type EndpointName<G extends GroupName> = HttpApiEndpoint.Identifier<
  HttpApiGroup.EndpointsWithIdentifier<Groups, G>
>

const projectRequirements = new Map<string, ProjectRequirement>()
const orgRequirements = new Map<string, OrgRequirement>()

HttpApi.reflect(AppApi, {
  onGroup: () => {},
  onEndpoint: ({ group, endpoint }) => {
    const id = `${group.identifier}.${endpoint.identifier}`
    Option.map(Context.getOption(endpoint.annotations, RequiresProject), (r) =>
      projectRequirements.set(id, r)
    )
    Option.map(Context.getOption(endpoint.annotations, RequiresOrg), (r) =>
      orgRequirements.set(id, r)
    )
  }
})

export const canCallProject = (permissions: ProjectPermissions) => {
  const role = Project.projectStatement.role(permissions)
  return <G extends GroupName>(group: G, endpoint: EndpointName<G>) => {
    const requirement = projectRequirements.get(`${group}.${endpoint}`)
    return requirement !== undefined && permits(role, requirement)
  }
}

export const canCallOrg = (orgRole: OrgRole) => {
  const role = Org.orgRoles[orgRole]
  return <G extends GroupName>(group: G, endpoint: EndpointName<G>) => {
    const requirement = orgRequirements.get(`${group}.${endpoint}`)
    return requirement !== undefined && permits(role, requirement)
  }
}
