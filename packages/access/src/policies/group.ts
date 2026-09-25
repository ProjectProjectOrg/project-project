import type { ProjectActor } from "./actor"

export type Kind = "sprint" | "milestone" | "epic" | "other"

export const canManage = (actor: ProjectActor, kind: Kind) =>
  actor.permissions.can(
    kind === "sprint" || kind === "milestone"
      ? { sprint: ["manage"] }
      : { epic: ["manage"] }
  )
