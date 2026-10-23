import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as SchemaGetter from "effect/SchemaGetter"
import * as SchemaIssue from "effect/SchemaIssue"

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const JsonRecord = Schema.Record(Schema.String, Schema.Json)

export const JiraUser = Schema.Struct({
  accountId: Schema.String,
  displayName: Schema.String,
  emailAddress: NullableString,
  active: NullableBoolean,
  accountType: NullableString,
  avatarUrls: Schema.optional(JsonRecord)
})
export type JiraUser = typeof JiraUser.Type

export const JiraProject = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.Json),
  projectTypeKey: NullableString,
  simplified: NullableBoolean,
  style: NullableString,
  lead: Schema.optional(JiraUser),
  avatarUrls: Schema.optional(JsonRecord)
})
export type JiraProject = typeof JiraProject.Type

export const JiraStatus = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: NullableString,
  statusCategory: Schema.optional(
    Schema.Struct({
      id: Schema.optional(Schema.Finite),
      key: Schema.optional(Schema.String),
      name: Schema.optional(Schema.String)
    })
  )
})
export type JiraStatus = typeof JiraStatus.Type

export const JiraIssueType = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  subtask: Schema.optional(Schema.Boolean)
})
export type JiraIssueType = typeof JiraIssueType.Type

export const JiraIssueTypeStatuses = Schema.Struct({
  ...JiraIssueType.fields,
  statuses: Schema.Array(JiraStatus)
})
export type JiraIssueTypeStatuses = typeof JiraIssueTypeStatuses.Type

export const JiraField = Schema.Struct({
  id: Schema.String,
  key: Schema.optional(Schema.String),
  name: Schema.String,
  custom: Schema.optional(Schema.Boolean),
  schema: Schema.optionalKey(Schema.Json)
})
export type JiraField = typeof JiraField.Type

export const JiraPriority = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: NullableString,
  iconUrl: NullableString,
  statusColor: NullableString
})
export type JiraPriority = typeof JiraPriority.Type

export const JiraComponent = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: NullableString,
  lead: Schema.optional(JiraUser)
})
export type JiraComponent = typeof JiraComponent.Type

export const JiraVersion = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: NullableString,
  archived: Schema.optional(Schema.Boolean),
  released: Schema.optional(Schema.Boolean),
  startDate: NullableString,
  releaseDate: NullableString
})
export type JiraVersion = typeof JiraVersion.Type

const RecoveredString = Schema.NullOr(Schema.NonEmptyString).pipe(
  Schema.catchDecoding(() => Effect.succeed(Option.some(null)))
)
const RecoveredLabels = Schema.Array(Schema.Json).pipe(
  Schema.decodeTo(Schema.Array(Schema.String), {
    decode: SchemaGetter.transform((values) =>
      values.filter(Predicate.isString)
    ),
    encode: SchemaGetter.passthrough()
  }),
  Schema.catchDecoding(() => Effect.succeed(Option.some([])))
)
const SourceReference = Schema.StructWithRest(
  Schema.Struct({ id: Schema.NonEmptyString }),
  [JsonRecord]
)
const IssueLink = Schema.StructWithRest(
  Schema.Struct({
    id: Schema.NonEmptyString,
    type: Schema.optionalKey(
      Schema.Struct({ name: Schema.optionalKey(RecoveredString) })
    ),
    inwardIssue: Schema.optionalKey(SourceReference),
    outwardIssue: Schema.optionalKey(SourceReference)
  }),
  [JsonRecord]
)
const IssueAttachment = Schema.StructWithRest(
  Schema.Struct({
    id: Schema.NonEmptyString,
    filename: Schema.optionalKey(RecoveredString),
    mimeType: Schema.optionalKey(RecoveredString),
    size: Schema.optionalKey(
      Schema.Finite.check(
        Schema.isInt(),
        Schema.isGreaterThanOrEqualTo(0)
      ).pipe(Schema.catchDecoding(() => Effect.succeed(Option.some(0))))
    ),
    content: Schema.optionalKey(RecoveredString),
    self: Schema.optionalKey(RecoveredString)
  }),
  [JsonRecord]
)
const issueFields = {
  summary: Schema.optionalKey(RecoveredString),
  description: Schema.optionalKey(Schema.Json),
  status: Schema.optionalKey(Schema.NullOr(SourceReference)),
  issuetype: Schema.optionalKey(Schema.NullOr(SourceReference)),
  priority: Schema.optionalKey(Schema.NullOr(SourceReference)),
  assignee: Schema.optionalKey(Schema.NullOr(JiraUser)),
  reporter: Schema.optionalKey(Schema.NullOr(JiraUser)),
  creator: Schema.optionalKey(Schema.NullOr(JiraUser)),
  parent: Schema.optionalKey(Schema.NullOr(SourceReference)),
  labels: Schema.optionalKey(RecoveredLabels),
  components: Schema.optionalKey(Schema.Array(SourceReference)),
  fixVersions: Schema.optionalKey(Schema.Array(SourceReference)),
  attachment: Schema.optionalKey(Schema.Array(IssueAttachment)),
  issuelinks: Schema.optionalKey(Schema.Array(IssueLink)),
  security: Schema.optionalKey(Schema.Json),
  created: Schema.optionalKey(RecoveredString),
  updated: Schema.optionalKey(RecoveredString)
}
export const JiraIssueFields = Schema.StructWithRest(
  Schema.Struct(issueFields),
  [JsonRecord]
)
const StrictIssueFields = Schema.Struct({
  ...issueFields,
  summary: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString)),
  labels: Schema.optionalKey(Schema.Array(Schema.String)),
  created: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString)),
  updated: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString)),
  attachment: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        ...IssueAttachment.schema.fields,
        filename: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString)),
        mimeType: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString)),
        size: Schema.optionalKey(
          Schema.Finite.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
        ),
        content: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString)),
        self: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString))
      })
    )
  ),
  issuelinks: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        ...IssueLink.schema.fields,
        type: Schema.optionalKey(
          Schema.Struct({
            name: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString))
          })
        )
      })
    )
  )
})
const decodeIssueFields = Schema.decodeUnknownEffect(JiraIssueFields)
const checkIssueFields = Schema.decodeUnknownResult(StrictIssueFields, {
  errors: "all"
})
const formatIssue = SchemaIssue.makeFormatterStandardSchemaV1()
const JiraIssueWire = Schema.Struct({
  id: Schema.NonEmptyString,
  key: Schema.NonEmptyString,
  fields: JsonRecord,
  normalizationWarnings: Schema.optionalKey(Schema.Array(Schema.String))
})
const JiraIssueValue = Schema.Struct({
  ...JiraIssueWire.fields,
  fields: Schema.toType(JiraIssueFields)
})
export const JiraIssue = JiraIssueWire.pipe(
  Schema.decodeTo(JiraIssueValue, {
    decode: SchemaGetter.transformEffect((issue) =>
      decodeIssueFields(issue.fields).pipe(
        Effect.mapError((error) => error.issue),
        Effect.map((fields) => {
          const checked = checkIssueFields(issue.fields)
          const warnings = Result.isFailure(checked)
            ? formatIssue(checked.failure.issue).issues.map(
                (failure) =>
                  `Normalized malformed field ${JSON.stringify(failure.path ?? [])} on ${issue.key}`
              )
            : []
          const normalized = Object.assign({}, issue, { fields })
          if (
            warnings.length === 0 &&
            issue.normalizationWarnings === undefined
          )
            return normalized
          return Object.assign(normalized, {
            normalizationWarnings: [
              ...new Set([...(issue.normalizationWarnings ?? []), ...warnings])
            ]
          })
        })
      )
    ),
    encode: SchemaGetter.passthrough()
  })
)
export type JiraIssue = typeof JiraIssue.Type

export const JiraIssueReference = Schema.Struct({
  id: Schema.String,
  key: Schema.String
})
export type JiraIssueReference = typeof JiraIssueReference.Type

export const JiraComment = Schema.Struct({
  id: Schema.String,
  body: Schema.Json,
  author: JiraUser,
  updateAuthor: Schema.optional(JiraUser),
  created: Schema.String,
  updated: NullableString,
  visibility: Schema.optional(Schema.Json)
})
export type JiraComment = typeof JiraComment.Type

export const JiraWorklog = Schema.Struct({
  id: Schema.String,
  author: JiraUser,
  updateAuthor: Schema.optional(JiraUser),
  comment: Schema.optional(Schema.Json),
  started: Schema.String,
  created: Schema.String,
  updated: Schema.String,
  timeSpentSeconds: Schema.Finite,
  visibility: Schema.optional(Schema.Json)
})
export type JiraWorklog = typeof JiraWorklog.Type

export const JiraChangelog = Schema.Struct({
  id: Schema.String,
  author: Schema.optional(JiraUser),
  created: Schema.String,
  items: Schema.Array(
    Schema.StructWithRest(
      Schema.Struct({
        fieldId: NullableString,
        field: NullableString,
        from: NullableString,
        to: NullableString
      }),
      [JsonRecord]
    )
  )
})
export type JiraChangelog = typeof JiraChangelog.Type

export const JiraWatchers = Schema.Struct({
  watchCount: Schema.Finite,
  isWatching: Schema.optional(Schema.Boolean),
  watchers: Schema.optional(Schema.Array(JiraUser))
})
export type JiraWatchers = typeof JiraWatchers.Type

export const JiraVotes = Schema.Struct({
  votes: Schema.Finite,
  hasVoted: Schema.optional(Schema.Boolean),
  voters: Schema.optional(Schema.Array(JiraUser))
})
export type JiraVotes = typeof JiraVotes.Type

export const JiraBoard = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
  type: Schema.String,
  location: Schema.optional(Schema.Json)
})
export type JiraBoard = typeof JiraBoard.Type

export const JiraBoardConfiguration = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
  type: Schema.String,
  location: Schema.optional(Schema.Json),
  columnConfig: Schema.optional(Schema.Json),
  estimation: Schema.optional(Schema.Json),
  ranking: Schema.optional(Schema.Json),
  filter: Schema.optional(Schema.Json)
})
export type JiraBoardConfiguration = typeof JiraBoardConfiguration.Type

export const JiraSprint = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
  state: Schema.String,
  startDate: NullableString,
  endDate: NullableString,
  completeDate: NullableString,
  goal: NullableString
})
export type JiraSprint = typeof JiraSprint.Type

export const JiraIssueSearchInput = Schema.Struct({
  jql: Schema.String,
  fields: Schema.Array(Schema.String),
  expand: Schema.optional(Schema.Array(Schema.String))
})
export type JiraIssueSearchInput = typeof JiraIssueSearchInput.Type

export type JiraSnapshot<A> = Readonly<{
  raw: Schema.Json
  value: A
}>

export type JiraCursorPage<A> = Readonly<{
  raw: Schema.Json
  values: ReadonlyArray<A>
  nextPageToken: string | null
}>

export type JiraOffsetPage<A> = Readonly<{
  raw: Schema.Json
  values: ReadonlyArray<A>
  startAt: number
  maxResults: number
  total: number | null
  isLast: boolean
}>

export type JiraPageInput = Readonly<{
  userId: string
  cloudId: string
}>
export type JiraOffsetPageInput = Readonly<
  JiraPageInput & {
    startAt?: number
  }
>
export type JiraIssuePageInput = Readonly<
  JiraOffsetPageInput & {
    issueIdOrKey: string
  }
>
export type JiraProjectPageInput = Readonly<
  JiraOffsetPageInput & {
    projectIdOrKey: string
  }
>
export type JiraSprintsPageInput = Readonly<
  JiraOffsetPageInput & {
    boardId: number
  }
>
export type JiraSearchIssuesPageInput = Readonly<
  JiraPageInput &
    JiraIssueSearchInput & {
      nextPageToken?: string | null
    }
>
export type JiraSprintIssuesPageInput = Readonly<
  JiraPageInput & {
    boardId: number
    sprintId: number
    fields: ReadonlyArray<string>
    nextPageToken?: string | null
  }
>
