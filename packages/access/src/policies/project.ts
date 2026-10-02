import type { ProjectActor } from "./actor"

export type Update = Readonly<{ body: boolean; settings: boolean }>

export const canUpdate = (actor: ProjectActor, update: Update) =>
  (!update.body || actor.permissions.can({ docs: ["write"] })) &&
  (!update.settings || actor.permissions.can({ settings: ["manage"] }))
