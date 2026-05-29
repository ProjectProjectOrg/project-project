import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  EverhourAuthInvalid,
  EverhourError,
  EverhourRateLimited
} from "@projectproject/shared"

export interface EverhourUser {
  readonly id: string
  readonly name: string | null
  readonly email: string | null
}

export interface EverhourProject {
  readonly id: string
  readonly name: string
  readonly type: "board" | "list"
}

export interface EverhourSection {
  readonly id: string
  readonly name: string
  readonly status: "open" | "archived"
}

export interface EverhourTask {
  readonly id: string
  readonly name: string
  readonly section: string | number | null
  readonly labels: ReadonlyArray<string>
  readonly status: "open" | "closed"
}

export interface EverhourTaskPayload {
  readonly name: string
  readonly section: string
  readonly labels: ReadonlyArray<string>
  readonly description: string
  readonly status: "open" | "closed"
}

export type EverhourClientError =
  | EverhourAuthInvalid
  | EverhourRateLimited
  | EverhourError

export interface EverhourShape {
  readonly getCurrentUser: (
    apiKey: string
  ) => Effect.Effect<EverhourUser, EverhourClientError>
  readonly getProject: (
    apiKey: string,
    projectId: string
  ) => Effect.Effect<EverhourProject, EverhourClientError>
  readonly createProject: (
    apiKey: string,
    input: {
      readonly name: string
      readonly type: "board"
      readonly users?: ReadonlyArray<string>
    }
  ) => Effect.Effect<EverhourProject, EverhourClientError>
  readonly updateProject: (
    apiKey: string,
    projectId: string,
    input: { readonly name: string }
  ) => Effect.Effect<EverhourProject, EverhourClientError>
  readonly createSection: (
    apiKey: string,
    projectId: string,
    input: { readonly name: string; readonly status: "open" | "archived" }
  ) => Effect.Effect<EverhourSection, EverhourClientError>
  readonly updateSection: (
    apiKey: string,
    sectionId: string,
    input: { readonly name: string; readonly status: "open" | "archived" }
  ) => Effect.Effect<EverhourSection, EverhourClientError>
  readonly getTask: (
    apiKey: string,
    taskId: string
  ) => Effect.Effect<EverhourTask, EverhourClientError>
  readonly createTask: (
    apiKey: string,
    projectId: string,
    payload: EverhourTaskPayload
  ) => Effect.Effect<EverhourTask, EverhourClientError>
  readonly updateTask: (
    apiKey: string,
    taskId: string,
    payload: EverhourTaskPayload
  ) => Effect.Effect<EverhourTask, EverhourClientError>
}

export class Everhour extends Context.Tag(
  "@projectproject/backend/Services/Everhour"
)<Everhour, EverhourShape>() {}
