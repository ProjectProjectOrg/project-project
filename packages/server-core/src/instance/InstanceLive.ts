import { Db } from "@pp/db"
import { organization } from "@pp/db/schema"
import { appProtocolVersion, InstanceNotConfigured } from "@pp/shared"
import { isNull } from "drizzle-orm"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

import { Instance } from "./Instance"

type OrgIdentity = Readonly<{ name: string; logo: string | null }>

type InstanceIdentityInput = Readonly<{
  configuredName: Option.Option<string>
  orgs: ReadonlyArray<OrgIdentity>
  host: string
}>

export const resolveInstanceIdentity = ({
  configuredName,
  orgs,
  host
}: InstanceIdentityInput) => {
  const onlyOrg = orgs.length === 1 ? orgs[0] : undefined
  return {
    name: Option.getOrElse(configuredName, () => onlyOrg?.name ?? host),
    logo: onlyOrg?.logo ?? null
  }
}

const nonBlank = (name: string) =>
  Config.option(Config.String(name)).pipe(
    Config.map(Option.map((value) => value.trim())),
    Config.map(Option.filter((value) => value.length > 0))
  )

const publicHost = Config.URL("BETTER_AUTH_URL").pipe(
  Config.withDefault(new URL("http://localhost:5173")),
  Config.map((url) => url.host)
)

const serverVersion = nonBlank("APP_VERSION").pipe(
  Config.map(Option.getOrElse(() => "dev"))
)

export const activeOrganization = isNull(organization.deletedAt)

export const makeInstance = (
  activeOrgs: Effect.Effect<ReadonlyArray<OrgIdentity>>
) =>
  Effect.gen(function* () {
    const instanceId = yield* nonBlank("INSTANCE_ID")
    const configuredName = yield* nonBlank("INSTANCE_NAME")
    const host = yield* publicHost
    const version = yield* serverVersion

    if (Option.isNone(instanceId)) {
      yield* Effect.logWarning(
        "INSTANCE_ID is not set; the ProjectProject app can't connect to this server until it is"
      )
    }

    const describe = Effect.gen(function* () {
      if (Option.isNone(instanceId)) {
        return yield* new InstanceNotConfigured()
      }
      const orgs = yield* activeOrgs
      return {
        instanceId: instanceId.value,
        ...resolveInstanceIdentity({ configuredName, orgs, host }),
        serverVersion: version,
        protocolVersion: appProtocolVersion
      }
    }).pipe(Effect.withSpan("Instance.describe"))

    return Instance.of({ describe })
  })

export const InstanceLive = Layer.effect(
  Instance,
  Effect.gen(function* () {
    const db = yield* Db
    return yield* makeInstance(
      db
        .select({ name: organization.name, logo: organization.logo })
        .from(organization)
        .where(activeOrganization)
        .limit(2)
        .pipe(Effect.orDie)
    )
  })
)
