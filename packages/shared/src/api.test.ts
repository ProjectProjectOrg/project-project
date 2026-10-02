import * as Context from "effect/Context"
import { HttpApi } from "effect/unstable/httpapi"
import { describe, expect, it } from "vitest"

import { IncludeDeletedOrg, OrgAccess, RequiresOrg } from "./access/OrgAccess"
import { ProjectAccess, RequiresProject } from "./access/ProjectAccess"
import { AppApi } from "./api"
import { Authentication } from "./Authentication"

type Route = Readonly<{
  name: string
  path: string
  middleware: ReadonlyArray<string>
  annotations: Context.Context<never>
}>

type Access = Readonly<{
  name: string
  middleware: Readonly<{ key: string }>
  annotation: Readonly<{ key: string }>
}>

const collectRoutes = (): ReadonlyArray<Route> => {
  const routes: Array<Route> = []
  HttpApi.reflect(AppApi, {
    onGroup: () => {},
    onEndpoint: ({ group, endpoint, middleware }) => {
      routes.push({
        name: `${group.identifier}.${endpoint.identifier}`,
        path: endpoint.path,
        middleware: [...middleware].map((service) => service.key),
        annotations: endpoint.annotations
      })
    }
  })
  return routes
}

const routes = collectRoutes()

const isProjectPath = (path: string) =>
  path.startsWith("/orgs/:orgSlug/projects/:slug")

const isOrgPath = (path: string) =>
  path.startsWith("/orgs/:orgSlug") && !isProjectPath(path)

const orgAccess: Access = {
  name: "OrgAccess",
  middleware: OrgAccess,
  annotation: RequiresOrg
}

const projectAccess: Access = {
  name: "ProjectAccess",
  middleware: ProjectAccess,
  annotation: RequiresProject
}

const access = [orgAccess, projectAccess]

const scoped = [{ ...orgAccess, covers: isOrgPath }]

const names = (matching: ReadonlyArray<Route>) =>
  matching.map((route) => route.name)

const carries = (route: Route, middleware: Access["middleware"]) =>
  route.middleware.includes(middleware.key)

const declares = (route: Route, annotation: Access["annotation"]) =>
  route.annotations.mapUnsafe.has(annotation.key)

describe.each(scoped)(
  "$name endpoints",
  ({ middleware, annotation, covers }) => {
    it("finds endpoints to check", () => {
      expect(routes.filter((route) => covers(route.path))).not.toHaveLength(0)
    })

    it("carries the middleware and declares what it requires", () => {
      expect(
        names(
          routes.filter(
            (route) =>
              covers(route.path) &&
              !(carries(route, middleware) && declares(route, annotation))
          )
        )
      ).toStrictEqual([])
    })
  }
)

describe.each(access)("$name", ({ middleware, annotation }) => {
  it("is never applied without its requirement", () => {
    expect(
      names(
        routes.filter(
          (route) => carries(route, middleware) && !declares(route, annotation)
        )
      )
    ).toStrictEqual([])
  })

  it("never declares a requirement nothing enforces", () => {
    expect(
      names(
        routes.filter(
          (route) => !carries(route, middleware) && declares(route, annotation)
        )
      )
    ).toStrictEqual([])
  })

  it("runs inside Authentication", () => {
    expect(
      names(
        routes.filter(
          (route) =>
            carries(route, middleware) &&
            !(
              route.middleware.indexOf(middleware.key) <
              route.middleware.indexOf(Authentication.key)
            )
        )
      )
    ).toStrictEqual([])
  })
})

describe("deleted orgs", () => {
  it("are reachable only to see and restore them", () => {
    expect(
      names(
        routes.filter((route) =>
          Context.get(route.annotations, IncludeDeletedOrg)
        )
      )
    ).toStrictEqual(["org.get", "org.restore"])
  })
})
