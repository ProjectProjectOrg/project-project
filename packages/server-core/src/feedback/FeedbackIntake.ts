import { Db } from "@pp/db"
import { feedbackReceipt } from "@pp/db/schema"
import {
  ActivityActor,
  attachmentUploadContentType,
  Conflict,
  type FeedbackReport,
  isRasterImageContentType,
  NotFound,
  ProjectScope,
  type ProjectScopeShape
} from "@pp/shared"
import { eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
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

type Receipt = Readonly<{
  ticketId: string | null
  verbatim: boolean
  completedAt: Date | null
}>

type Intake = Option.Option.Value<FeedbackConfigShape["intake"]>

export type FeedbackIntakeShape = Readonly<{
  receive: (
    report: FeedbackReport,
    files: ReadonlyArray<Multipart.PersistedFile>
  ) => Effect.Effect<void, NotFound | Conflict>
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

      const openReceipt = Effect.fn("FeedbackIntake.openReceipt")(function* (
        reportId: string
      ) {
        const inserted = yield* db
          .insert(feedbackReceipt)
          .values({ reportId })
          .onConflictDoNothing()
          .returning({ reportId: feedbackReceipt.reportId })
          .pipe(Effect.orDie)
        if (inserted.length > 0) return Option.none<Receipt>()
        const [existing] = yield* db
          .select({
            ticketId: feedbackReceipt.ticketId,
            verbatim: feedbackReceipt.verbatim,
            completedAt: feedbackReceipt.completedAt
          })
          .from(feedbackReceipt)
          .where(eq(feedbackReceipt.reportId, reportId))
          .limit(1)
          .pipe(Effect.orDie)
        return Option.fromNullishOr(existing)
      })

      const releaseReceipt = (reportId: string) =>
        db
          .delete(feedbackReceipt)
          .where(eq(feedbackReceipt.reportId, reportId))
          .pipe(Effect.orDie)

      const recordTicket = (
        reportId: string,
        ticketId: string,
        verbatim: boolean
      ) =>
        db
          .update(feedbackReceipt)
          .set({ ticketId, verbatim })
          .where(eq(feedbackReceipt.reportId, reportId))
          .pipe(Effect.orDie)

      const completeReceipt = (reportId: string) =>
        Effect.flatMap(DateTime.nowAsDate, (completedAt) =>
          db
            .update(feedbackReceipt)
            .set({ completedAt })
            .where(eq(feedbackReceipt.reportId, reportId))
            .pipe(Effect.orDie)
        )

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

      const feedbackScope = (intake: Intake) =>
        systemProjects
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

      const fileTicket = Effect.fn("FeedbackIntake.fileTicket")(function* (
        scope: ProjectScopeShape,
        report: FeedbackReport
      ) {
        const create = (verbatim: boolean) =>
          tickets
            .create({
              title: report.title,
              type: feedbackTicketType(report),
              body: feedbackTicketBody(report, { verbatim })
            })
            .pipe(Effect.map((ticket) => ({ ticketId: ticket.id, verbatim })))
        return yield* create(false).pipe(
          Effect.catchTag("Validation", () => create(true)),
          Effect.provideService(ProjectScope, scope),
          Effect.orDie
        )
      })

      const finish = Effect.fn("FeedbackIntake.finish")(function* (
        scope: ProjectScopeShape,
        report: FeedbackReport,
        filed: Readonly<{ ticketId: string; verbatim: boolean }>,
        files: ReadonlyArray<Multipart.PersistedFile>
      ) {
        if (files.length > 0 || report.attachments.length > 0) {
          yield* attachFiles(
            scope,
            report,
            filed.ticketId,
            filed.verbatim,
            files
          )
        }
        yield* completeReceipt(report.id)
        yield* Effect.logInfo("feedback received", {
          ticketId: filed.ticketId,
          instance: report.instance.url,
          files: files.length
        })
      })

      const receive: FeedbackIntakeShape["receive"] = Effect.fn(
        "FeedbackIntake.receive"
      )(function* (report, files) {
        if (Option.isNone(config.intake)) return yield* new NotFound()
        const intake = config.intake.value
        const receipt = yield* openReceipt(report.id)
        if (Option.isNone(receipt)) {
          const scope = yield* feedbackScope(intake).pipe(
            Effect.onError(() => releaseReceipt(report.id))
          )
          const filed = yield* fileTicket(scope, report).pipe(
            Effect.onError(() => releaseReceipt(report.id))
          )
          yield* recordTicket(report.id, filed.ticketId, filed.verbatim)
          return yield* finish(scope, report, filed, files)
        }
        const { ticketId, verbatim, completedAt } = receipt.value
        if (completedAt !== null) {
          yield* Effect.logInfo("feedback already received", {
            reportId: report.id
          })
          return
        }
        if (ticketId === null) {
          return yield* new Conflict({ reason: "feedback_in_progress" })
        }
        const scope = yield* feedbackScope(intake)
        yield* finish(scope, report, { ticketId, verbatim }, files)
      })

      return { receive } satisfies FeedbackIntakeShape
    })
  )
}
