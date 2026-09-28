import { AppApi, appProtocolVersion, type InstanceDescriptor } from "@pp/shared"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import { HttpClient } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
import { URL } from "whatwg-url-minimum"

export type ServerProblem =
  | "unreachable"
  | "not_projectproject"
  | "not_configured"
  | "insecure_redirect"
  | "server_outdated"
  | "app_outdated"

export class ServerCheckFailed extends Data.TaggedError("ServerCheckFailed")<
  Readonly<{ problem: ServerProblem }>
> {}

export type CheckedServer = Readonly<{
  origin: string
  descriptor: InstanceDescriptor
}>

export const instancePath = "/api/instance"

export const checkTimeout = "10 seconds"

export const protocolProblem = (serverVersion: number, appVersion: number) => {
  if (serverVersion < appVersion) return "server_outdated"
  if (serverVersion > appVersion) return "app_outdated"
  return null
}

export const answeredOrigin = (requested: string, responseUrl: string) => {
  const answered = new URL(responseUrl)
  if (answered.pathname !== instancePath) return "not_projectproject"
  if (answered.protocol === "http:" && requested.startsWith("https:")) {
    return "insecure_redirect"
  }
  return answered.origin
}

const failWith = (problem: ServerProblem) =>
  Effect.fail(new ServerCheckFailed({ problem }))

export const checkServer = Effect.fn("checkServer")(function* (origin: string) {
  const instance = yield* HttpApiClient.group(AppApi, {
    group: "instance",
    httpClient: yield* HttpClient.HttpClient,
    baseUrl: `${origin}/api`
  })
  const [descriptor, response] = yield* instance
    .get({ responseMode: "decoded-and-response" })
    .pipe(
      Effect.catchTags({
        InstanceNotConfigured: () => failWith("not_configured"),
        HttpClientError: (error) =>
          failWith(
            Predicate.isTagged(error.reason, "TransportError")
              ? "unreachable"
              : "not_projectproject"
          ),
        SchemaError: () => failWith("not_projectproject")
      }),
      Effect.timeoutOrElse({
        duration: checkTimeout,
        orElse: () => failWith("unreachable")
      })
    )
  const answered = answeredOrigin(origin, response.url)
  if (answered === "not_projectproject" || answered === "insecure_redirect") {
    return yield* failWith(answered)
  }
  const problem = protocolProblem(
    descriptor.protocolVersion,
    appProtocolVersion
  )
  if (problem !== null) return yield* failWith(problem)
  return { origin: answered, descriptor } satisfies CheckedServer
})
