import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { expect } from "vitest"

import { localDbLayer } from "./LocalDb"
import { localProjectFacts } from "./projectFacts"
import { copyOf } from "./store"
import { install, snapshot } from "./testFacts"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({}))
)

const status = (slug: string, orderKey: string) => ({
  slug,
  label: slug,
  icon: "Circle",
  color: "#777777",
  orderKey,
  description: null
})

it.effect(
  "project facts give the project, its statuses in order, tags and members",
  () =>
    Effect.gen(function* () {
      yield* install("a/p", {
        ...snapshot("1.1", []),
        statuses: [status("done", "a2"), status("todo", "a0")],
        tags: [{ name: "bug", color: "#ff0000" }],
        members: [
          {
            userId: "user-1",
            role: "pm",
            name: "Ada",
            username: null,
            image: null
          }
        ]
      })

      const facts = yield* localProjectFacts((yield* copyOf("a/p")) ?? -1)
      expect(facts?.project.key).toBe("T")
      expect(facts?.statuses.map((fact) => fact.slug)).toEqual(["todo", "done"])
      expect(facts?.tags.map((tag) => tag.name)).toEqual(["bug"])
      expect(facts?.members.map((member) => member.name)).toEqual(["Ada"])
    }).pipe(Effect.provide(TestDatabase))
)
