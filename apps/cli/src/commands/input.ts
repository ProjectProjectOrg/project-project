import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as Stdio from "effect/Stdio"
import * as Stream from "effect/Stream"

import { usage } from "../CliFailure"
import type { Field } from "./fields"

const decodeJson = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Unknown)
)

export const readStdin = Effect.gen(function* () {
  const stdio = yield* Stdio.Stdio
  return yield* stdio.stdin.pipe(
    Stream.decodeText(),
    Stream.mkString,
    Effect.mapError(() => usage("Couldn't read standard input."))
  )
})

export const readText = Effect.fnUntraced(function* (source: string) {
  if (source === "-") return yield* readStdin
  const fs = yield* FileSystem.FileSystem
  return yield* fs
    .readFileString(source)
    .pipe(Effect.mapError(() => usage(`Couldn't read ${source}.`)))
})

const textValue = (value: string) =>
  value.startsWith("@") ? readText(value.slice(1)) : Effect.succeed(value)

const present = (raw: unknown): Option.Option<unknown> => {
  if (Option.isOption(raw)) return raw
  if (Array.isArray(raw) && raw.length === 0) return Option.none()
  return raw === undefined ? Option.none() : Option.some(raw)
}

const valueFor = (field: Field, value: unknown) => {
  if (field.nullable && field.kind === "string" && value === "null") {
    return Effect.succeed(null)
  }
  if (
    field.kind === "strings" &&
    Array.isArray(value) &&
    value.every((item) => item === "")
  ) {
    return Effect.succeed([])
  }
  if (field.kind === "json" && Predicate.isString(value)) {
    return Effect.flatMap(textValue(value), (text) =>
      decodeJson(text).pipe(
        Effect.mapError(() =>
          usage(`--${field.name} must be JSON (or @file with JSON in it).`)
        )
      )
    )
  }
  if (field.kind === "string" && Predicate.isString(value)) {
    return textValue(value)
  }
  return Effect.succeed(value)
}

export const toolInput = (
  fields: ReadonlyArray<Field>,
  raw: Readonly<Record<string, unknown>>,
  scope: Readonly<Record<string, Option.Option<string>>>
) =>
  Effect.gen(function* () {
    const input: Record<string, unknown> = {}
    for (const field of fields) {
      const given = Option.orElse(
        present(raw[field.name]),
        () => scope[field.name] ?? Option.none()
      )
      if (Option.isSome(given)) {
        input[field.name] = yield* valueFor(field, given.value)
      }
    }
    return input
  })
