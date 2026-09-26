import { it } from "@effect/vitest"
import { Db } from "@pp/db"
import { appProtocolVersion } from "@pp/shared"
import { PgDialect } from "drizzle-orm/pg-core"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { expect } from "vitest"

import { Instance } from "./Instance"
import { InstanceLive, resolveInstanceIdentity } from "./InstanceLive"

type OrgRow = Readonly<{
  name: string
  logo: string | null
  deleted?: boolean
}>

const dialect = new PgDialect()

const excludesDeletedOrgs = (condition: unknown) =>
  dialect
    .sqlToQuery(condition as never)
    .sql.includes('"organization"."deleted_at" is null')

const makeDb = (orgs: ReadonlyArray<OrgRow>) =>
  Layer.succeed(Db, {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => ({
          limit: (count: number) =>
            Effect.succeed(
              orgs
                .filter(
                  (org) =>
                    !excludesDeletedOrgs(condition) || org.deleted !== true
                )
                .slice(0, count)
                .map(({ name, logo }) => ({ name, logo }))
            )
        })
      })
    })
  } as never)

const instanceLayer = (
  env: Readonly<Record<string, string>>,
  orgs: ReadonlyArray<OrgRow> = []
) =>
  InstanceLive.pipe(
    Layer.provide(makeDb(orgs)),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env)))
  )

const describe = Effect.gen(function* () {
  const instance = yield* Instance
  return yield* instance.describe
})

const configured = {
  INSTANCE_ID: "3f9c2a7e8b1d4c6f",
  BETTER_AUTH_URL: "https://pp.igne.nl"
}

it("resolveInstanceIdentity prefers the configured name and keeps the only org's logo", () => {
  expect(
    resolveInstanceIdentity({
      configuredName: Option.some("Igne"),
      orgs: [{ name: "Igne Labs", logo: "https://pp.igne.nl/logo.png" }],
      host: "pp.igne.nl"
    })
  ).toEqual({ name: "Igne", logo: "https://pp.igne.nl/logo.png" })
})

it("resolveInstanceIdentity uses the only org when no name is configured", () => {
  expect(
    resolveInstanceIdentity({
      configuredName: Option.none(),
      orgs: [{ name: "Igne", logo: null }],
      host: "pp.igne.nl"
    })
  ).toEqual({ name: "Igne", logo: null })
})

it("resolveInstanceIdentity falls back to the host when there are several orgs or none", () => {
  const fallback = { name: "pp.igne.nl", logo: null }
  expect(
    resolveInstanceIdentity({
      configuredName: Option.none(),
      orgs: [
        { name: "Igne", logo: "https://pp.igne.nl/igne.png" },
        { name: "Client", logo: null }
      ],
      host: "pp.igne.nl"
    })
  ).toEqual(fallback)
  expect(
    resolveInstanceIdentity({
      configuredName: Option.none(),
      orgs: [],
      host: "pp.igne.nl"
    })
  ).toEqual(fallback)
})

it.effect("describes the instance from its config and only org", () =>
  describe.pipe(
    Effect.map((descriptor) =>
      expect(descriptor).toEqual({
        instanceId: "3f9c2a7e8b1d4c6f",
        name: "Igne",
        logo: null,
        serverVersion: "dev",
        protocolVersion: appProtocolVersion
      })
    ),
    Effect.provide(instanceLayer(configured, [{ name: "Igne", logo: null }]))
  )
)

it.effect("uses a trimmed INSTANCE_NAME and the image's APP_VERSION", () =>
  describe.pipe(
    Effect.map((descriptor) => {
      expect(descriptor.name).toBe("Igne")
      expect(descriptor.serverVersion).toBe("sha-457effd")
    }),
    Effect.provide(
      instanceLayer(
        { ...configured, INSTANCE_NAME: " Igne ", APP_VERSION: "sha-457effd" },
        [
          { name: "Igne", logo: null },
          { name: "Client", logo: null }
        ]
      )
    )
  )
)

it.effect(
  "falls back to the public host, port included, for several orgs",
  () =>
    describe.pipe(
      Effect.map((descriptor) =>
        expect(descriptor.name).toBe("localhost:5173")
      ),
      Effect.provide(
        instanceLayer({ INSTANCE_ID: "3f9c2a7e8b1d4c6f" }, [
          { name: "Igne", logo: null },
          { name: "Client", logo: null }
        ])
      )
    )
)

it.effect(
  "fails with InstanceNotConfigured when INSTANCE_ID is missing or blank",
  () =>
    Effect.gen(function* () {
      for (const env of [
        { BETTER_AUTH_URL: "https://pp.igne.nl" },
        { ...configured, INSTANCE_ID: "  " }
      ]) {
        const error = yield* describe.pipe(
          Effect.flip,
          Effect.provide(instanceLayer(env))
        )
        expect(error._tag).toBe("InstanceNotConfigured")
      }
    })
)

it.effect("refuses to build with a malformed BETTER_AUTH_URL", () =>
  describe.pipe(
    Effect.provide(
      instanceLayer({ ...configured, BETTER_AUTH_URL: "not a url" })
    ),
    Effect.exit,
    Effect.map((exit) => expect(Exit.isFailure(exit)).toBe(true))
  )
)

it.effect("ignores deleted orgs when picking the only org", () =>
  describe.pipe(
    Effect.map((descriptor) => expect(descriptor.name).toBe("Igne")),
    Effect.provide(
      instanceLayer(configured, [
        { name: "Old Igne", logo: null, deleted: true },
        { name: "Igne", logo: null }
      ])
    )
  )
)
