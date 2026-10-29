import * as BunServices from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { notSignedIn } from "../CliFailure"
import { type SavedServer, ServerStore } from "../servers/ServerStore"
import { fakeHttp } from "../testing"
import { attachFile, contentTypeFor } from "./attach"

const server: SavedServer = {
  origin: "https://pp.example.com",
  user: { id: "u-1", name: "Ada", email: "ada@example.com" },
  endpoints: { token: "https://pp.example.com/api/auth/oauth2/token" },
  tokens: {
    accessToken: "access",
    refreshToken: "refresh",
    expiresAt: Number.MAX_SAFE_INTEGER
  }
}

const decodeJson = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Unknown)
)

const store = Layer.succeed(
  ServerStore,
  ServerStore.of({
    file: "servers.json",
    list: Effect.die("unused"),
    save: () => Effect.die("unused"),
    remove: () => Effect.die("unused"),
    setDefault: () => Effect.die("unused"),
    setScope: () => Effect.die("unused"),
    update: () => Effect.die("unused"),
    select: () => Effect.fail(notSignedIn("unused"))
  })
)

const decoder = new TextDecoder()

describe("attachFile", () => {
  it.effect("prepares, uploads, then appends the markdown to the ticket", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const directory = yield* fs.makeTempDirectoryScoped()
      const file = `${directory}/screen.png`
      yield* fs.writeFile(file, new Uint8Array([137, 80, 78, 71]))
      const calls: Array<string> = []
      const uploads: Array<readonly [string, number]> = []
      const updates: Array<string> = []
      const http = fakeHttp((url, request) => {
        calls.push(`${request.method} ${url.pathname}`)
        if (url.pathname.endsWith("/prepare_ticket_attachment")) {
          return Response.json({
            id: "01JBX7Q2K9ZWCVE8MTQ4RXPGHN",
            url: "/api/attachments/acme/01JBX7Q2K9ZWCVE8MTQ4RXPGHN",
            uploadUrl: "https://pp.example.com/api/attachment-uploads?token=t",
            expiresAt: "2026-11-01T00:00:00.000Z",
            markdown:
              "![screen.png](/api/attachments/acme/01JBX7Q2K9ZWCVE8MTQ4RXPGHN)"
          })
        }
        if (request.body._tag === "Uint8Array") {
          if (url.pathname.endsWith("/update_ticket")) {
            updates.push(decoder.decode(request.body.body))
          } else {
            uploads.push([request.body.contentType, request.body.body.length])
          }
        }
        return Response.json({ ok: true })
      })
      const attached = yield* attachFile(
        server,
        { orgSlug: "acme", projectSlug: "web" },
        "T-130",
        file
      ).pipe(Effect.provide(Layer.mergeAll(http, store, BunServices.layer)))
      expect(calls).toEqual([
        "POST /api/v1/tools/prepare_ticket_attachment",
        "POST /api/attachment-uploads",
        "POST /api/v1/tools/update_ticket"
      ])
      expect(uploads).toEqual([["image/png", 4]])
      expect(yield* decodeJson(updates[0] ?? "")).toEqual({
        orgSlug: "acme",
        projectSlug: "web",
        id: "T-130",
        edits: [{ kind: "append", text: attached.markdown }]
      })
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer))
  )

  it("only accepts file types the server stores", () => {
    expect(contentTypeFor("shot.PNG")).toBe("image/png")
    expect(contentTypeFor("notes.md")).toBe("text/markdown")
    expect(contentTypeFor("payload.exe")).toBeUndefined()
  })
})
