import * as Option from "effect/Option"

import type { OrgLocation, SavedServer } from "./model"

const hasOrg = (servers: ReadonlyArray<SavedServer>, location: OrgLocation) =>
  servers.some(
    (server) =>
      server.instanceId === location.instanceId &&
      server.orgs.some((org) => org.slug === location.orgSlug)
  )

const firstOrg = (servers: ReadonlyArray<SavedServer>) =>
  Option.fromUndefinedOr(
    servers.flatMap((server) =>
      server.orgs.map(
        (org): OrgLocation => ({
          instanceId: server.instanceId,
          orgSlug: org.slug
        })
      )
    )[0]
  )

export const startLocation = (
  servers: ReadonlyArray<SavedServer>,
  lastUsed: Option.Option<OrgLocation>
) =>
  Option.filter(lastUsed, (location) => hasOrg(servers, location)).pipe(
    Option.orElse(() => firstOrg(servers))
  )
