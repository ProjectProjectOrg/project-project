import { Effective } from "@pp/access/roles"
import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import { organization, projectIndex, user } from "@pp/db/schema"
import { NotFound } from "@pp/shared"
import { and, eq, isNull, ne } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

import { Bots, type Bot, type BotsShape } from "./Bots"

const BOT_ORG_ROLE = "guest"

const botUserId = (bot: Bot) => `bot_${bot.key}`

const botEmail = (bot: Bot) => `${bot.key}@bots.projectproject.invalid`

export const BotsLive = Layer.effect(
  Bots,
  Effect.gen(function* () {
    const db = yield* Db

    const ensure: BotsShape["ensure"] = Effect.fn("Bots.ensure")(
      function* (bot) {
        const id = botUserId(bot)
        yield* db
          .insert(user)
          .values({
            id,
            name: bot.name,
            email: botEmail(bot),
            emailVerified: false,
            banned: true,
            banReason: "bot"
          })
          .onConflictDoUpdate({
            target: user.id,
            set: { name: bot.name },
            setWhere: ne(user.name, bot.name)
          })
          .pipe(Effect.orDie)
        return id
      }
    )

    const projectScope: BotsShape["projectScope"] = Effect.fn(
      "Bots.projectScope"
    )(function* (bot, orgSlug, slug) {
      const userId = yield* ensure(bot)
      const [row] = yield* db
        .select({
          projectId: projectIndex.id,
          organizationId: projectIndex.organizationId
        })
        .from(projectIndex)
        .innerJoin(
          organization,
          and(
            eq(organization.id, projectIndex.organizationId),
            eq(organization.slug, orgSlug),
            isNull(organization.deletedAt)
          )
        )
        .where(and(eq(projectIndex.slug, slug), publishedProject()))
        .limit(1)
        .pipe(Effect.orDie)
      if (!row) return yield* new NotFound()
      const permissions = Effective.roleOnProject(BOT_ORG_ROLE, bot.role)
      if (Option.isNone(permissions)) return yield* new NotFound()
      return {
        userId,
        organizationId: row.organizationId,
        orgSlug,
        orgRole: BOT_ORG_ROLE,
        projectId: row.projectId,
        slug,
        role: bot.role,
        permissions: permissions.value
      }
    })

    return { ensure, projectScope } satisfies BotsShape
  })
)
