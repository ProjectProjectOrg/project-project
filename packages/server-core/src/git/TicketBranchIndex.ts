import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  organization,
  projectGithubRepository,
  projectIndex,
  projectIntegrationLink,
  ticketBranch,
  ticketIndex
} from "@pp/db/schema"
import type { ChecksStatus, TicketBranchEntry } from "@pp/shared"
import {
  and,
  asc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  type SQL
} from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import type * as TicketIndex from "../tickets/TicketIndex"
import type { TicketProject } from "../tickets/ticketProject"

const stackEntryFromRow = (
  row: typeof ticketBranch.$inferSelect
): TicketBranchEntry =>
  Object.assign(
    { branch: row.branch },
    row.base === null ? {} : { base: row.base },
    row.pr === null ? {} : { pr: row.pr },
    row.prState === null ? {} : { prState: row.prState },
    row.prDraft ? { prDraft: true } : {},
    row.landed ? { landed: true } : {}
  )

export type BranchRepository = Readonly<{ repoId: string; isDefault: boolean }>

const inRepository = (repository: BranchRepository): SQL | undefined =>
  repository.isDefault
    ? or(eq(ticketIndex.repoId, repository.repoId), isNull(ticketIndex.repoId))
    : eq(ticketIndex.repoId, repository.repoId)

export class TicketBranchIndex extends Context.Service<
  TicketBranchIndex,
  Readonly<{
    findTicketsByBranch: (
      projectId: string,
      repository: BranchRepository,
      branch: string
    ) => Effect.Effect<ReadonlyArray<TicketIndex.TicketIndexMatch>>
    findStackLayers: (
      projectId: string,
      repository: BranchRepository,
      branch: string
    ) => Effect.Effect<ReadonlyArray<TicketIndex.TicketIndexMatch>>
    stacksFor: (
      project: TicketProject,
      ticketIds?: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyMap<string, ReadonlyArray<TicketBranchEntry>>>
    findMergesAwaiting: (
      projectId: string,
      repository: BranchRepository,
      base: string
    ) => Effect.Effect<
      ReadonlyArray<
        TicketIndex.TicketIndexMatch & Readonly<{ stacked: boolean }>
      >
    >
    isRepositoryBranchAttached: (
      repoId: string,
      branch: string,
      stackedOnly?: boolean
    ) => Effect.Effect<boolean>
    getBranchDeletedAt: (
      project: TicketProject,
      ticketId: string
    ) => Effect.Effect<Date | null>
    markBranchStale: (
      projectId: string,
      repository: BranchRepository,
      branch: string,
      deletedAt: Date
    ) => Effect.Effect<ReadonlyArray<string>>
    clearBranchStale: (
      project: TicketProject,
      ticketIds: ReadonlyArray<string>
    ) => Effect.Effect<void>
    updateBranchChecks: (
      projectId: string,
      repository: BranchRepository,
      branch: string,
      checks: ChecksStatus,
      headSha: string,
      updatedAt: Date
    ) => Effect.Effect<ReadonlyArray<string>>
  }>
>()("@pp/server-core/git/TicketBranchIndex") {}

const make = Effect.gen(function* () {
  const db = yield* Db

  const findTicketsByBranch = Effect.fn(
    "TicketBranchIndex.findTicketsByBranch"
  )(function* (
    projectId: string,
    repository: BranchRepository,
    branch: string
  ) {
    return yield* db
      .select({
        orgSlug: organization.slug,
        organizationId: ticketIndex.organizationId,
        projectId: ticketIndex.projectId,
        slug: projectIndex.slug,
        ticketId: ticketIndex.ticketId,
        branch: ticketIndex.branch
      })
      .from(ticketIndex)
      .innerJoin(projectIndex, eq(projectIndex.id, ticketIndex.projectId))
      .innerJoin(organization, eq(organization.id, ticketIndex.organizationId))
      .where(
        and(
          eq(ticketIndex.projectId, projectId),
          inRepository(repository),
          eq(ticketIndex.branch, branch)
        )
      )
      .pipe(
        Effect.map((rows) =>
          rows.flatMap((row) =>
            row.branch === null ? [] : [{ ...row, branch: row.branch }]
          )
        ),
        Effect.orDie
      )
  })

  const stackLayerMatches = (where: SQL | undefined) =>
    db
      .select({
        orgSlug: organization.slug,
        organizationId: projectIndex.organizationId,
        projectId: ticketBranch.projectId,
        slug: projectIndex.slug,
        ticketId: ticketBranch.ticketId,
        branch: ticketBranch.branch
      })
      .from(ticketBranch)
      .innerJoin(
        ticketIndex,
        and(
          eq(ticketIndex.projectId, ticketBranch.projectId),
          eq(ticketIndex.ticketId, ticketBranch.ticketId)
        )
      )
      .innerJoin(projectIndex, eq(projectIndex.id, ticketBranch.projectId))
      .innerJoin(organization, eq(organization.id, projectIndex.organizationId))
      .where(where)

  const findStackLayers = Effect.fn("TicketBranchIndex.findStackLayers")(
    function* (
      projectId: string,
      repository: BranchRepository,
      branch: string
    ) {
      return yield* stackLayerMatches(
        and(
          eq(ticketBranch.projectId, projectId),
          inRepository(repository),
          eq(ticketBranch.branch, branch)
        )
      ).pipe(Effect.orDie)
    }
  )

  const stacksFor = Effect.fn("TicketBranchIndex.stacksFor")(function* (
    project: TicketProject,
    ticketIds?: ReadonlyArray<string>
  ) {
    return yield* ticketIds !== undefined && ticketIds.length === 0
      ? Effect.succeed(new Map())
      : db
          .select()
          .from(ticketBranch)
          .where(
            and(
              eq(ticketBranch.projectId, project.projectId),
              ticketIds === undefined
                ? undefined
                : inArray(ticketBranch.ticketId, [...ticketIds])
            )
          )
          .orderBy(asc(ticketBranch.ticketId), asc(ticketBranch.position))
          .pipe(
            Effect.map((rows) => {
              const stacks = new Map<string, Array<TicketBranchEntry>>()
              for (const row of rows) {
                const stack = stacks.get(row.ticketId) ?? []
                stack.push(stackEntryFromRow(row))
                stacks.set(row.ticketId, stack)
              }
              return stacks
            }),
            Effect.orDie
          )
  })

  const findMergesAwaiting = Effect.fn("TicketBranchIndex.findMergesAwaiting")(
    function* (projectId: string, repository: BranchRepository, base: string) {
      return yield* Effect.all(
        [
          db
            .select({
              orgSlug: organization.slug,
              organizationId: projectIndex.organizationId,
              projectId: ticketIndex.projectId,
              slug: projectIndex.slug,
              ticketId: ticketIndex.ticketId,
              branch: ticketIndex.branch
            })
            .from(ticketIndex)
            .innerJoin(projectIndex, eq(projectIndex.id, ticketIndex.projectId))
            .innerJoin(
              organization,
              eq(organization.id, projectIndex.organizationId)
            )
            .where(
              and(
                eq(ticketIndex.projectId, projectId),
                inRepository(repository),
                eq(ticketIndex.prBase, base),
                eq(ticketIndex.prState, "merged"),
                isNotNull(ticketIndex.pr),
                or(
                  isNull(ticketIndex.lastTransitionedPr),
                  ne(ticketIndex.lastTransitionedPr, ticketIndex.pr)
                )
              )
            ),
          stackLayerMatches(
            and(
              eq(ticketBranch.projectId, projectId),
              inRepository(repository),
              eq(ticketBranch.base, base),
              eq(ticketBranch.prState, "merged"),
              eq(ticketBranch.landed, false)
            )
          )
        ],
        { concurrency: 2 }
      ).pipe(
        Effect.map(([own, stacked]) => [
          ...own.flatMap((row) =>
            row.branch === null
              ? []
              : [{ ...row, branch: row.branch, stacked: false }]
          ),
          ...stacked.map((row) => ({ ...row, stacked: true }))
        ]),
        Effect.orDie
      )
    }
  )

  const isRepositoryBranchAttached = Effect.fn(
    "TicketBranchIndex.isRepositoryBranchAttached"
  )(function* (repoId: string, branch: string, stackedOnly = false) {
    return yield* db
      .select({ ticketId: ticketIndex.ticketId })
      .from(ticketIndex)
      .innerJoin(
        projectIntegrationLink,
        eq(projectIntegrationLink.projectId, ticketIndex.projectId)
      )
      .innerJoin(
        projectGithubRepository,
        eq(
          projectGithubRepository.projectIntegrationLinkId,
          projectIntegrationLink.id
        )
      )
      .where(
        and(
          eq(projectGithubRepository.repoId, repoId),
          or(eq(ticketIndex.repoId, repoId), isNull(ticketIndex.repoId)),
          eq(projectIntegrationLink.provider, "github"),
          inArray(projectIntegrationLink.status, ["active", "broken"]),
          inArray(projectGithubRepository.status, ["active", "broken"]),
          or(
            stackedOnly ? undefined : eq(ticketIndex.branch, branch),
            exists(
              db
                .select({ branch: ticketBranch.branch })
                .from(ticketBranch)
                .where(
                  and(
                    eq(ticketBranch.projectId, ticketIndex.projectId),
                    eq(ticketBranch.ticketId, ticketIndex.ticketId),
                    eq(ticketBranch.branch, branch)
                  )
                )
            )
          )
        )
      )
      .limit(1)
      .pipe(
        Effect.map((rows) => rows.length > 0),
        Effect.orDie
      )
  })

  const getBranchDeletedAt = Effect.fn("TicketBranchIndex.getBranchDeletedAt")(
    function* (project: TicketProject, id: string) {
      return yield* db
        .select({ branchDeletedAt: ticketIndex.branchDeletedAt })
        .from(ticketIndex)
        .innerJoin(projectIndex, eq(projectIndex.id, ticketIndex.projectId))
        .innerJoin(
          organization,
          eq(organization.id, projectIndex.organizationId)
        )
        .where(
          and(
            eq(organization.slug, project.orgSlug),
            eq(projectIndex.slug, project.slug),
            publishedProject(),
            eq(ticketIndex.ticketId, id)
          )
        )
        .limit(1)
        .pipe(
          Effect.map((rows) => rows[0]?.branchDeletedAt ?? null),
          Effect.orDie
        )
    }
  )

  const markBranchStale = Effect.fn("TicketBranchIndex.markBranchStale")(
    function* (
      projectId: string,
      repository: BranchRepository,
      branch: string,
      deletedAt: Date
    ) {
      return yield* db
        .update(ticketIndex)
        .set({ branchDeletedAt: deletedAt })
        .where(
          and(
            eq(ticketIndex.projectId, projectId),
            inRepository(repository),
            eq(ticketIndex.branch, branch),
            isNull(ticketIndex.branchDeletedAt)
          )
        )
        .returning({ ticketId: ticketIndex.ticketId })
        .pipe(
          Effect.map((rows) => rows.map((row) => row.ticketId)),
          Effect.orDie
        )
    }
  )

  const clearBranchStale = Effect.fn("TicketBranchIndex.clearBranchStale")(
    function* (project: TicketProject, ticketIds: ReadonlyArray<string>) {
      if (ticketIds.length === 0) return
      yield* db
        .update(ticketIndex)
        .set({ branchDeletedAt: null })
        .where(
          and(
            eq(ticketIndex.projectId, project.projectId),
            inArray(ticketIndex.ticketId, [...ticketIds])
          )
        )
        .pipe(Effect.orDie)
    }
  )

  const updateBranchChecks = Effect.fn("TicketBranchIndex.updateBranchChecks")(
    function* (
      projectId: string,
      repository: BranchRepository,
      branch: string,
      checks: ChecksStatus,
      headSha: string,
      updatedAt: Date
    ) {
      return yield* db
        .update(ticketIndex)
        .set({ checks, checksHeadSha: headSha, checksUpdatedAt: updatedAt })
        .where(
          and(
            eq(ticketIndex.projectId, projectId),
            inRepository(repository),
            eq(ticketIndex.branch, branch),
            or(
              isNull(ticketIndex.checksUpdatedAt),
              lt(ticketIndex.checksUpdatedAt, updatedAt)
            )
          )
        )
        .returning({ ticketId: ticketIndex.ticketId })
        .pipe(
          Effect.map((rows) => rows.map((row) => row.ticketId)),
          Effect.orDie
        )
    }
  )

  return TicketBranchIndex.of({
    findTicketsByBranch,
    findStackLayers,
    stacksFor,
    findMergesAwaiting,
    isRepositoryBranchAttached,
    getBranchDeletedAt,
    markBranchStale,
    clearBranchStale,
    updateBranchChecks
  })
})

export const layer = Layer.effect(TicketBranchIndex, make)
