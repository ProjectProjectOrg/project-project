import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

import { OrgAccess, RequiresOrg } from "../access/OrgAccess"
import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import { Forbidden, NotFound, Unauthorized } from "../errors"
import { OrgPath, ProjectPath } from "../http/paths"
import { Slug } from "../projects/Project"
import { PinKind, PinTarget, ReorderPinInput, SidebarPin } from "./SidebarPin"

const PinPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  kind: PinKind,
  ref: Schema.String
})

const pinPath = "/orgs/:orgSlug/projects/:slug/pins/:kind/:ref"

export const SidebarPinsGroup = HttpApiGroup.make("sidebarPins")
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/pins", {
      params: OrgPath,
      success: Schema.Array(SidebarPin),
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("pin", "/orgs/:orgSlug/projects/:slug/pins", {
      params: ProjectPath,
      payload: PinTarget,
      success: SidebarPin,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.patch("reorder", pinPath, {
      params: PinPath,
      payload: ReorderPinInput,
      success: SidebarPin,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete("unpin", pinPath, {
      params: PinPath,
      success: HttpApiSchema.NoContent,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .middleware(Authentication)
