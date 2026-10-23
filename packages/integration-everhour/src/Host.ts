import type { EverhourConfigMissing, NotFound, OrgScope } from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export type EverhourProjectRef = Readonly<{
  projectId: string
  organizationId: string
}>

export type EverhourSprint = Readonly<{
  id: string
  name: string
  completed: boolean
  tickets: ReadonlyArray<string>
}>

type SealedSecret = Readonly<{
  ciphertext: string
  nonce: string
  tag: string
}>

export class EverhourHost extends Context.Service<
  EverhourHost,
  Readonly<{
    project: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<EverhourProjectRef>
    publishedName: (projectId: string) => Effect.Effect<string, NotFound>
    projectPath: (
      projectId: string
    ) => Effect.Effect<Readonly<{ orgSlug: string; slug: string }> | null>
    memberIds: (projectId: string) => Effect.Effect<ReadonlyArray<string>>
    sprints: (
      orgSlug: string,
      slug: string
    ) => Effect.Effect<ReadonlyArray<EverhourSprint>>
    ticketTitle: (
      orgSlug: string,
      slug: string,
      ticketId: string
    ) => Effect.Effect<string | null>
    timeReadableSlug: (
      projectId: string
    ) => Effect.Effect<string | null, never, OrgScope>
    seal: (
      plaintext: string
    ) => Effect.Effect<SealedSecret, EverhourConfigMissing>
    open: (sealed: SealedSecret) => Effect.Effect<string, EverhourConfigMissing>
  }>
>()("@pp/integration-everhour/Host/EverhourHost") {}
