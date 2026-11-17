import {
  MemberFact,
  ProjectFact,
  ProjectStatus,
  StatusFact,
  Tag,
  TagFact
} from "@pp/shared"
import { asc, eq } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { LocalDb } from "./LocalDb"
import type { LocalProjectFacts } from "./LocalRpcs"
import { localMembers, localProjects, localStatuses, localTags } from "./tables"

const UNKNOWN_CREATION = {
  createdBy: "",
  createdAt: "1970-01-01T00:00:00.000Z"
} as const

const decodeProject = Schema.decodeUnknownSync(
  Schema.fromJsonString(ProjectFact)
)
const decodeStatusFact = Schema.decodeUnknownSync(
  Schema.fromJsonString(StatusFact)
)
const decodeTagFact = Schema.decodeUnknownSync(Schema.fromJsonString(TagFact))
const decodeMember = Schema.decodeUnknownSync(Schema.fromJsonString(MemberFact))
const decodeProjectStatus = Schema.decodeUnknownOption(ProjectStatus)
const decodeTag = Schema.decodeUnknownOption(Tag)

export const localProjectFacts = (copy: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const [project] = yield* db
      .select({ data: localProjects.data })
      .from(localProjects)
      .where(eq(localProjects.copy, copy))
    if (project === undefined) return null
    const statuses = yield* db
      .select({ data: localStatuses.data })
      .from(localStatuses)
      .where(eq(localStatuses.copy, copy))
    const tags = yield* db
      .select({ data: localTags.data })
      .from(localTags)
      .where(eq(localTags.copy, copy))
      .orderBy(asc(localTags.id))
    const members = yield* db
      .select({ data: localMembers.data })
      .from(localMembers)
      .where(eq(localMembers.copy, copy))
      .orderBy(asc(localMembers.id))
    return {
      project: decodeProject(project.data),
      statuses: statuses
        .flatMap((row) =>
          Option.toArray(
            decodeProjectStatus({
              ...decodeStatusFact(row.data),
              ...UNKNOWN_CREATION
            })
          )
        )
        .toSorted((a, b) =>
          a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0
        ),
      tags: tags.flatMap((row) =>
        Option.toArray(
          decodeTag({ ...decodeTagFact(row.data), ...UNKNOWN_CREATION })
        )
      ),
      members: members.map((row) => decodeMember(row.data))
    } satisfies LocalProjectFacts
  })
