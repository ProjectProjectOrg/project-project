import { type AttachmentContentType, Tools } from "@pp/shared"
import { Argument, Command } from "effect/cli"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { HttpClient, HttpClientRequest } from "effect/http"
import * as Path from "effect/Path"

import { callTool, callToolAs } from "../client/callTool"
import { CliFailure, ExitCode, unreachable, usage } from "../CliFailure"
import { printResult } from "../output/format"
import type { SavedServer } from "../servers/ServerStore"
import { currentScope, currentServer, requireSlug } from "./context"
import { root } from "./root"

const contentTypes: Readonly<Record<string, AttachmentContentType>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
  tgz: "application/gzip",
  tar: "application/x-tar",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown"
}

export const contentTypeFor = (filename: string) =>
  contentTypes[filename.toLowerCase().split(".").at(-1) ?? ""]

export const attachFile = Effect.fn("attachFile")(function* (
  server: SavedServer,
  scope: Readonly<{ orgSlug: string; projectSlug: string }>,
  id: string,
  file: string
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const filename = path.basename(file)
  const contentType = contentTypeFor(filename)
  if (contentType === undefined) {
    return yield* usage(
      `pp can't attach ${filename}: use PNG, JPEG, GIF, WebP, AVIF, PDF, ZIP, gzip, tar, text or markdown.`
    )
  }
  const bytes = yield* fs
    .readFile(file)
    .pipe(Effect.mapError(() => usage(`Couldn't read ${file}.`)))
  const prepared = yield* callToolAs(
    server,
    "prepare_ticket_attachment",
    { ...scope, ticketId: id, filename, contentType },
    Tools.tools.prepare_ticket_attachment.successSchema
  )
  const client = yield* HttpClient.HttpClient
  const uploaded = yield* HttpClientRequest.post(prepared.uploadUrl).pipe(
    HttpClientRequest.bodyUint8Array(bytes, contentType),
    client.execute,
    Effect.mapError(() => unreachable(`Couldn't upload ${filename}.`))
  )
  if (uploaded.status < 200 || uploaded.status >= 300) {
    return yield* new CliFailure({
      message: `The upload of ${filename} was rejected (HTTP ${uploaded.status}).`,
      code: ExitCode.invalidInput
    })
  }
  yield* callTool(server, "update_ticket", {
    ...scope,
    id,
    edits: [{ kind: "append", text: prepared.markdown }]
  })
  return { filename, url: prepared.url, markdown: prepared.markdown }
})

export const attachCommand = Command.make(
  "attach",
  {
    id: Argument.String("id").pipe(
      Argument.withDescription("Ticket id, e.g. T-12.")
    ),
    file: Argument.String("file").pipe(
      Argument.withDescription("The file to attach.")
    )
  },
  ({ id, file }) =>
    Effect.gen(function* () {
      const flags = yield* root
      const server = yield* currentServer
      const scope = yield* currentScope
      const attached = yield* attachFile(
        server,
        {
          orgSlug: yield* requireSlug(scope.org, "org"),
          projectSlug: yield* requireSlug(scope.project, "project")
        },
        id,
        file
      )
      if (flags.json) {
        return yield* printResult({ id, ...attached }, true)
      }
      yield* Console.log(`Attached ${attached.filename} to ${id}.`)
    })
).pipe(
  Command.withDescription(
    "Upload a file and add it to the end of a ticket's description, in one step."
  ),
  Command.withExamples([
    {
      command: "pp tickets attach T-130 ./screenshot.png",
      description: "Attach a screenshot to T-130"
    }
  ])
)
