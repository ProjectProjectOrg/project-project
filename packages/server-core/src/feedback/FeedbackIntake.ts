import { Db } from "@pp/db"
import { feedbackReceipt } from "@pp/db/schema"
import {
  ActivityActor,
  attachmentUploadContentType,
  type FeedbackReport,
  isRasterImageContentType,
  NotFound,
  ProjectScope,
  type ProjectScopeShape
} from "@pp/shared"
import { eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import type { Multipart } from "effect/http"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

import { Attachments } from "../attachments/Attachments"
import type { Bot } from "../bots/Bots"
import { SystemProjects } from "../projects/SystemProjects"
import { Tickets } from "../tickets/Tickets"
import { FeedbackConfig, type FeedbackConfigShape } from "./FeedbackConfig"
import {
  feedbackTicketBody,
  feedbackTicketType,
  singleLineFilename,
  type StoredFeedbackAttachment,
  unstoredFiles
} from "./feedbackTicket"

export const FeedbackBot: Bot = {
  key: "feedback",
  name: "Feedback",
  role: "client"
}

const skipFile =
  (ticketId: string, file: Multipart.PersistedFile) => (cause: unknown) =>
    Effect.logWarning("feedback attachment not stored", {
      ticketId,
      filename: file.name,
      cause
    }).pipe(Effect.as(Option.none<StoredFeedbackAttachment>()))

type Intake = Option.Option.Value<FeedbackConfigShape["intake"]>

export type FeedbackIntakeShape = Readonly<{
  receive: (
    report: FeedbackReport,
    files: ReadonlyArray<Multipart.PersistedFile>
  ) => Effect.Effect<void, NotFound>
}>

export class FeedbackIntake extends Context.Service<
  FeedbackIntake,
  FeedbackIntakeShape
>()("@pp/server-core/feedback/FeedbackIntake") {
  static readonly layer = Layer.effect(
    FeedbackIntake,
    Effect.gen(function* () {
      const db = yield* Db
      const config = yield* FeedbackConfig
      const systemProjects = yield* SystemProjects
      const tickets = yield* Tickets
      const attachments = yield* Attachments
      const fs = yield* FileSystem.FileSystem

      const claimReceipt = (reportId: string) =>
        db
          .insert(feedbackReceipt)
          .values({ reportId })
          .onConflictDoNothing()
          .returning({ reportId: feedbackReceipt.reportId })
          .pipe(
            Effect.map((rows) => rows.length > 0),
            Effect.orDie
          )

      const releaseReceipt = (reportId: string) =>
        db
          .delete(feedbackReceipt)
          .where(eq(feedbackReceipt.reportId, reportId))
          .pipe(Effect.orDie)

      const recordTicket = (reportId: string, ticketId: string) =>
        db
          .update(feedbackReceipt)
          .set({ ticketId })
          .where(eq(feedbackReceipt.reportId, reportId))
          .pipe(Effect.orDie)

      const storeFile = Effect.fn("FeedbackIntake.storeFile")(
        function* (ticketId: string, file: Multipart.PersistedFile) {
          const filename = singleLineFilename(file.name)
          const contentType = attachmentUploadContentType(
            filename,
            file.contentType
          )
          const bytes = yield* fs.readFile(file.path)
          const stored = yield* attachments.storeBytes(ticketId, {
            filename,
            contentType,
            bytes
          })
          return Option.some<StoredFeedbackAttachment>({
            filename,
            url: stored.url,
            image: isRasterImageContentType(contentType)
          })
        },
        (effect, ticketId, file) =>
          effect.pipe(
            Effect.catch(skipFile(ticketId, file)),
            Effect.catchDefect(skipFile(ticketId, file))
          )
      )

      const attachFiles = Effect.fn("FeedbackIntake.attachFiles")(
        function* (
          _scope: ProjectScopeShape,
          report: FeedbackReport,
          ticketId: string,
          verbatim: boolean,
          files: ReadonlyArray<Multipart.PersistedFile>
        ) {
          const stored = (yield* Effect.forEach(files, (file) =>
            storeFile(ticketId, file)
          )).flatMap(Option.toArray)
          const notStored = unstoredFiles(
            report.attachments,
            stored.map((file) => file.filename)
          )
          yield* tickets.update(ticketId, {
            body: feedbackTicketBody(report, {
              verbatim,
              attachments: { stored, notStored }
            })
          })
        },
        (effect, scope) =>
          effect.pipe(
            Effect.provideService(ProjectScope, scope),
            Effect.provideService(
              ActivityActor,
              ActivityActor.user(scope.userId)
            ),
            Effect.orDie
          )
      )

      const fileTicket = Effect.fn("FeedbackIntake.fileTicket")(function* (
        intake: Intake,
        report: FeedbackReport
      ) {
        const scope = yield* systemProjects
          .ensure({
            role: "feedback",
            orgSlug: intake.orgSlug,
            name: intake.projectName,
            key: intake.projectKey,
            bot: FeedbackBot
          })
          .pipe(
            Effect.tapErrorTag("NotFound", () =>
              Effect.logWarning("feedback intake org not found", {
                orgSlug: intake.orgSlug
              })
            ),
            Effect.catchTag("MarkdownError", Effect.die)
          )
        const create = (verbatim: boolean) =>
          tickets
            .create({
              title: report.title,
              type: feedbackTicketType(report),
              body: feedbackTicketBody(report, { verbatim })
            })
            .pipe(Effect.map((ticket) => ({ ticket, verbatim })))
        const created = yield* create(false).pipe(
          Effect.catchTag("Validation", () => create(true)),
          Effect.provideService(ProjectScope, scope),
          Effect.orDie
        )
        return { scope, ...created }
      })

      const receive: FeedbackIntakeShape["receive"] = Effect.fn(
        "FeedbackIntake.receive"
      )(function* (report, files) {
        if (Option.isNone(config.intake)) return yield* new NotFound()
        if (!(yield* claimReceipt(report.id))) {
          yield* Effect.logInfo("feedback already received", {
            reportId: report.id
          })
          return
        }
        const { scope, ticket, verbatim } = yield* fileTicket(
          config.intake.value,
          report
        ).pipe(Effect.onError(() => releaseReceipt(report.id)))
        yield* recordTicket(report.id, ticket.id)
        if (files.length > 0 || report.attachments.length > 0) {
          yield* attachFiles(scope, report, ticket.id, verbatim, files)
        }
        yield* Effect.logInfo("feedback received", {
          ticketId: ticket.id,
          instance: report.instance.url,
          files: files.length
        })
      })

      return { receive } satisfies FeedbackIntakeShape
    })
  )
}
