import {
  EverhourAuthInvalid,
  EverhourError,
  EverhourRateLimited
} from "@projectproject/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import {
  Everhour,
  type EverhourClientError,
  type EverhourProject,
  type EverhourSection,
  type EverhourShape,
  type EverhourTask,
  type EverhourUser
} from "../Services/Everhour"

const baseUrl = "https://api.everhour.com"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const textField = (
  value: Record<string, unknown>,
  key: string
): string | null => (typeof value[key] === "string" ? value[key] : null)

const idField = (value: Record<string, unknown>): string => String(value.id)

const mapUser = (value: unknown): EverhourUser => {
  const record = isRecord(value) ? value : {}
  return {
    id: idField(record),
    name: textField(record, "name"),
    email: textField(record, "email")
  }
}

const mapProject = (value: unknown): EverhourProject => {
  const record = isRecord(value) ? value : {}
  return {
    id: idField(record),
    name: textField(record, "name") ?? "",
    type: record.type === "list" ? "list" : "board"
  }
}

const mapSection = (value: unknown): EverhourSection => {
  const record = isRecord(value) ? value : {}
  return {
    id: idField(record),
    name: textField(record, "name") ?? "",
    status: record.status === "archived" ? "archived" : "open"
  }
}

const mapTask = (value: unknown): EverhourTask => {
  const record = isRecord(value) ? value : {}
  const labels = Array.isArray(record.labels)
    ? record.labels.flatMap((label) =>
        typeof label === "string" ? [label] : []
      )
    : []
  return {
    id: idField(record),
    name: textField(record, "name") ?? "",
    section:
      typeof record.section === "string" || typeof record.section === "number"
        ? record.section
        : null,
    labels,
    status: record.status === "closed" ? "closed" : "open"
  }
}

const errorMessage = (body: unknown) => {
  if (!isRecord(body)) return "Everhour error"
  const message = body.message ?? body.error ?? body.detail
  return typeof message === "string" ? message : "Everhour error"
}

const payloadPreview = (payload: unknown) => {
  const text =
    typeof payload === "string" ? payload : JSON.stringify(payload ?? null)
  return text.length > 500 ? `${text.slice(0, 500)}...` : text
}

const hasTag = (cause: unknown, tag: string) =>
  isRecord(cause) && cause._tag === tag

const isEverhourClientError = (cause: unknown): cause is EverhourClientError =>
  hasTag(cause, "EverhourAuthInvalid") ||
  hasTag(cause, "EverhourRateLimited") ||
  hasTag(cause, "EverhourError")

const request = <A>(
  apiKey: string,
  method: string,
  path: string,
  body: unknown,
  map: (value: unknown) => A
) =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${baseUrl}${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey,
            "X-Accept-Version": "1.2"
          },
          body: body === undefined ? undefined : Response.json(body).body
        }),
      catch: (cause) => new EverhourError({ message: String(cause) })
    })
    const payload =
      response.status === 204
        ? null
        : yield* Effect.promise(() => response.json().catch(() => null))
    if (response.ok) return map(payload)
    const message = errorMessage(payload)
    const endpoint = `${method} ${baseUrl}${path}`
    yield* Effect.logWarning(
      `Everhour API request failed: ${endpoint} -> ${response.status} ${message}`
    ).pipe(
      Effect.annotateLogs({
        endpoint,
        method,
        path,
        status: response.status,
        message,
        responseBody: payloadPreview(payload)
      })
    )
    if (response.status === 401) return yield* new EverhourAuthInvalid()
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "1")
      return yield* new EverhourRateLimited({
        retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 1
      })
    }
    return yield* new EverhourError({ message })
  }).pipe(
    Effect.catchAll((cause) =>
      isEverhourClientError(cause)
        ? Effect.fail(cause)
        : Effect.fail(new EverhourError({ message: String(cause) }))
    )
  )

export const EverhourLive = Layer.succeed(Everhour, {
  getCurrentUser: (apiKey) =>
    request(apiKey, "GET", "/users/me", undefined, mapUser),
  getProject: (apiKey, projectId) =>
    request(
      apiKey,
      "GET",
      `/projects/${encodeURIComponent(projectId)}`,
      undefined,
      mapProject
    ),
  createProject: (apiKey, input) =>
    request(apiKey, "POST", "/projects", input, mapProject),
  updateProject: (apiKey, projectId, input) =>
    request(
      apiKey,
      "PUT",
      `/projects/${encodeURIComponent(projectId)}`,
      { ...input, type: "board" },
      mapProject
    ),
  createSection: (apiKey, projectId, input) =>
    request(
      apiKey,
      "POST",
      `/projects/${encodeURIComponent(projectId)}/sections`,
      input,
      mapSection
    ),
  updateSection: (apiKey, sectionId, input) =>
    request(
      apiKey,
      "PUT",
      `/sections/${encodeURIComponent(sectionId)}`,
      input,
      mapSection
    ),
  getTask: (apiKey, taskId) =>
    request(
      apiKey,
      "GET",
      `/tasks/${encodeURIComponent(taskId)}`,
      undefined,
      mapTask
    ),
  createTask: (apiKey, projectId, payload) =>
    request(
      apiKey,
      "POST",
      `/projects/${encodeURIComponent(projectId)}/tasks`,
      payload,
      mapTask
    ),
  updateTask: (apiKey, taskId, payload) =>
    request(
      apiKey,
      "PUT",
      `/tasks/${encodeURIComponent(taskId)}`,
      payload,
      mapTask
    )
} satisfies EverhourShape)
