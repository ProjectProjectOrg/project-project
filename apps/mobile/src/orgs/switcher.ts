import type { SavedServer } from "@/servers/model"

export type OrgGroup = Readonly<{
  server: SavedServer
  orgs: SavedServer["orgs"]
}>

export const orgGroups = (
  servers: ReadonlyArray<SavedServer>,
  signedIn: ReadonlyArray<string>
): ReadonlyArray<OrgGroup> =>
  servers.flatMap((server) =>
    signedIn.includes(server.instanceId) && server.orgs.length > 0
      ? [{ server, orgs: server.orgs }]
      : []
  )
