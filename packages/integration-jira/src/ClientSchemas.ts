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

export const UNKNOWN_JIRA_ACCOUNT_ID = "jira:unknown-user"
export const UNKNOWN_JIRA_USER: JiraUser = {
  accountId: UNKNOWN_JIRA_ACCOUNT_ID,
  displayName: "Unknown Jira user"
}
const UNKNOWN_TIMESTAMP = "1970-01-01T00:00:00.000Z"

const StrictJiraUser = Schema.Struct({
  ...JiraUser.fields,
  accountId: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString
})
const decodeStrictUserOption = Schema.decodeUnknownOption(StrictJiraUser)
const UserIdentity = Schema.StructWithRest(
  Schema.Struct({
    accountId: Schema.NonEmptyString,
    displayName: Schema.optionalKey(Schema.Json),
    emailAddress: Schema.optionalKey(Schema.Json),
    active: Schema.optionalKey(Schema.Json),
    accountType: Schema.optionalKey(Schema.Json)
  }),
  [JsonRecord]
)
const decodeUserIdentityOption = Schema.decodeUnknownOption(UserIdentity)
const decodeNonEmptyStringOption = Schema.decodeUnknownOption(
  Schema.NonEmptyString
)
const decodeBooleanOption = Schema.decodeUnknownOption(Schema.Boolean)

export const recoverJiraUser = (value: unknown): JiraUser | null =>
  decodeStrictUserOption(value).pipe(
    Option.orElse(() =>
      decodeUserIdentityOption(value).pipe(
        Option.map((user) => {
          const email = decodeNonEmptyStringOption(user.emailAddress)
          const active = decodeBooleanOption(user.active)
          const accountType = decodeNonEmptyStringOption(user.accountType)
          return {
            accountId: user.accountId,
            displayName: decodeNonEmptyStringOption(user.displayName).pipe(
              Option.getOrElse(() => user.accountId)
            ),
            ...(Option.isSome(email) ? { emailAddress: email.value } : {}),
            ...(Option.isSome(active) ? { active: active.value } : {}),
            ...(Option.isSome(accountType)
              ? { accountType: accountType.value }
              : {})
          }
        })
      )
    ),
    Option.getOrNull
  )

const RecoveredUser = Schema.Json.pipe(
  Schema.decodeTo(Schema.NullOr(Schema.toType(JiraUser)), {
    decode: SchemaGetter.transform(recoverJiraUser),
    encode: SchemaGetter.passthrough({ strict: false })
  })
)
const RecoveredUsers = Schema.Array(Schema.Json).pipe(
  Schema.decodeTo(Schema.Array(Schema.toType(JiraUser)), {
    decode: SchemaGetter.transform((values) =>
      values.map(recoverJiraUser).filter(Predicate.isNotNull)
    ),
    encode: SchemaGetter.passthrough({ strict: false })
  }),
  Schema.catchDecoding(() => Effect.succeedSome([]))
)

export const JiraProject = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.Json),
  projectTypeKey: NullableString,
  simplified: NullableBoolean,
  style: NullableString,
  lead: Schema.optional(RecoveredUser),
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
  Schema.catchDecoding(() => Effect.succeedSome([]))
)
const SourceReference = Schema.StructWithRest(
  Schema.Struct({ id: Schema.NonEmptyString }),
  [JsonRecord]
)
const decodeSourceReferenceOption = Schema.decodeUnknownOption(SourceReference)
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
const RecoveredReference = Schema.NullOr(SourceReference).pipe(
  Schema.catchDecoding(() => Effect.succeedSome(null))
)
const RecoveredReferences = Schema.Array(Schema.Json).pipe(
  Schema.decodeTo(Schema.Array(Schema.toType(SourceReference)), {
    decode: SchemaGetter.transform((values) =>
      values.flatMap((value) =>
        Option.toArray(decodeSourceReferenceOption(value))
      )
    ),
    encode: SchemaGetter.passthrough({ strict: false })
  }),
  Schema.catchDecoding(() => Effect.succeedSome([]))
)
const issueFields = {
  summary: Schema.optionalKey(RecoveredString),
  description: Schema.optionalKey(Schema.Json),
  status: Schema.optionalKey(Schema.NullOr(SourceReference)),
  issuetype: Schema.optionalKey(Schema.NullOr(SourceReference)),
  priority: Schema.optionalKey(RecoveredReference),
  assignee: Schema.optionalKey(RecoveredUser),
  reporter: Schema.optionalKey(RecoveredUser),
  creator: Schema.optionalKey(RecoveredUser),
  parent: Schema.optionalKey(RecoveredReference),
  labels: Schema.optionalKey(RecoveredLabels),
  components: Schema.optionalKey(RecoveredReferences),
  fixVersions: Schema.optionalKey(RecoveredReferences),
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
  priority: Schema.optionalKey(Schema.NullOr(SourceReference)),
  assignee: Schema.optionalKey(Schema.NullOr(StrictJiraUser)),
  reporter: Schema.optionalKey(Schema.NullOr(StrictJiraUser)),
  creator: Schema.optionalKey(Schema.NullOr(StrictJiraUser)),
  parent: Schema.optionalKey(Schema.NullOr(SourceReference)),
  components: Schema.optionalKey(Schema.Array(SourceReference)),
  fixVersions: Schema.optionalKey(Schema.Array(SourceReference)),
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

const NormalizationWarnings = Schema.optionalKey(Schema.Array(Schema.String))

const recoveredRecord = <
  Lenient extends Schema.Top & { readonly Type: Schema.JsonObject },
  Value extends Schema.Top
>(
  label: string,
  lenient: Lenient,
  strict: Schema.Decoder<unknown>,
  value: Value,
  build: (
    record: Lenient["Type"]
  ) => Omit<Value["Type"], "normalizationWarnings">
) => {
  const check = Schema.decodeUnknownResult(strict, { errors: "all" })
  return lenient.pipe(
    Schema.decodeTo(Schema.toType(value), {
      decode: SchemaGetter.transform((record: Lenient["Type"]) => {
        const checked = check(record)
        const previous = decodeWarningsOption(
          record.normalizationWarnings
        ).pipe(Option.getOrElse((): ReadonlyArray<string> => []))
        const warnings = Result.isFailure(checked)
          ? formatIssue(checked.failure.issue).issues.map(
              (failure) =>
                `Normalized malformed field ${JSON.stringify(failure.path ?? [])} on ${label} ${Predicate.isString(record.id) ? record.id : JSON.stringify(record.id)}`
            )
          : []
        const built = build(record)
        const merged = [...new Set([...previous, ...warnings])]
        return (
          merged.length === 0
            ? built
            : Object.assign({}, built, { normalizationWarnings: merged })
        ) as Value["Type"]
      }),
      encode: SchemaGetter.passthrough({ strict: false })
    })
  )
}
const decodeWarningsOption = Schema.decodeUnknownOption(
  Schema.Array(Schema.String)
)
const decodeStringOption = Schema.decodeUnknownOption(Schema.String)
const decodeNullableStringOption = Schema.decodeUnknownOption(
  Schema.NullOr(Schema.String)
)
const decodeFiniteOption = Schema.decodeUnknownOption(Schema.Finite)
const timestamp = (...candidates: ReadonlyArray<unknown>) =>
  candidates
    .map((candidate) => decodeNonEmptyStringOption(candidate))
    .find(Option.isSome)?.value ?? UNKNOWN_TIMESTAMP
const lenientRecord = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.StructWithRest(
    Schema.Struct({ id: Schema.NonEmptyString, ...fields }),
    [JsonRecord]
  )
const optionalJson = Schema.optionalKey(Schema.Json)

const JiraCommentValue = Schema.Struct({
  id: Schema.String,
  body: Schema.Json,
  author: JiraUser,
  updateAuthor: Schema.optional(JiraUser),
  created: Schema.String,
  updated: NullableString,
  visibility: Schema.optional(Schema.Json),
  normalizationWarnings: NormalizationWarnings
})
export const JiraComment = recoveredRecord(
  "comment",
  lenientRecord({
    body: optionalJson,
    author: optionalJson,
    updateAuthor: optionalJson,
    created: optionalJson,
    updated: optionalJson,
    visibility: optionalJson
  }),
  Schema.Struct({
    id: Schema.NonEmptyString,
    body: Schema.Json,
    author: StrictJiraUser,
    updateAuthor: Schema.optional(StrictJiraUser),
    created: Schema.NonEmptyString,
    updated: NullableString
  }),
  JiraCommentValue,
  (record) => {
    const updateAuthor = recoverJiraUser(record.updateAuthor)
    const updated = decodeNullableStringOption(record.updated)
    return {
      id: record.id,
      body: record.body ?? null,
      author: recoverJiraUser(record.author) ?? UNKNOWN_JIRA_USER,
      ...(updateAuthor === null ? {} : { updateAuthor }),
      created: timestamp(record.created, record.updated),
      ...(Option.isSome(updated) ? { updated: updated.value } : {}),
      ...(record.visibility === undefined
        ? {}
        : { visibility: record.visibility })
    }
  }
)
export type JiraComment = typeof JiraComment.Type

const JiraWorklogValue = Schema.Struct({
  id: Schema.String,
  author: JiraUser,
  updateAuthor: Schema.optional(JiraUser),
  comment: Schema.optional(Schema.Json),
  started: Schema.String,
  created: Schema.String,
  updated: Schema.String,
  timeSpentSeconds: Schema.Finite,
  visibility: Schema.optional(Schema.Json),
  normalizationWarnings: NormalizationWarnings
})
export const JiraWorklog = recoveredRecord(
  "worklog",
  lenientRecord({
    author: optionalJson,
    updateAuthor: optionalJson,
    comment: optionalJson,
    started: optionalJson,
    created: optionalJson,
    updated: optionalJson,
    timeSpentSeconds: optionalJson,
    visibility: optionalJson
  }),
  Schema.Struct({
    id: Schema.NonEmptyString,
    author: StrictJiraUser,
    updateAuthor: Schema.optional(StrictJiraUser),
    started: Schema.NonEmptyString,
    created: Schema.NonEmptyString,
    updated: Schema.NonEmptyString,
    timeSpentSeconds: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
  }),
  JiraWorklogValue,
  (record) => {
    const updateAuthor = recoverJiraUser(record.updateAuthor)
    const created = timestamp(record.created, record.started, record.updated)
    return {
      id: record.id,
      author: recoverJiraUser(record.author) ?? UNKNOWN_JIRA_USER,
      ...(updateAuthor === null ? {} : { updateAuthor }),
      ...(record.comment === undefined || record.comment === null
        ? {}
        : { comment: record.comment }),
      started: timestamp(record.started, record.created, record.updated),
      created,
      updated: timestamp(record.updated, record.created),
      timeSpentSeconds: Math.max(
        0,
        decodeFiniteOption(record.timeSpentSeconds).pipe(
          Option.getOrElse(() => 0)
        )
      ),
      ...(record.visibility === undefined
        ? {}
        : { visibility: record.visibility })
    }
  }
)
export type JiraWorklog = typeof JiraWorklog.Type

const ChangelogItem = Schema.StructWithRest(
  Schema.Struct({
    fieldId: NullableString,
    field: NullableString,
    from: NullableString,
    to: NullableString
  }),
  [JsonRecord]
)
const decodeChangelogItemsOption = Schema.decodeUnknownOption(
  Schema.Array(Schema.Json)
)
const decodeRecordOption = Schema.decodeUnknownOption(JsonRecord)
const JiraChangelogValue = Schema.Struct({
  id: Schema.String,
  author: Schema.optional(JiraUser),
  created: Schema.String,
  items: Schema.Array(Schema.toType(ChangelogItem)),
  normalizationWarnings: NormalizationWarnings
})
export const JiraChangelog = recoveredRecord(
  "changelog",
  lenientRecord({
    author: optionalJson,
    created: optionalJson,
    items: optionalJson
  }),
  Schema.Struct({
    id: Schema.NonEmptyString,
    author: Schema.optional(StrictJiraUser),
    created: Schema.NonEmptyString,
    items: Schema.Array(ChangelogItem)
  }),
  JiraChangelogValue,
  (record) => {
    const author = recoverJiraUser(record.author)
    return {
      id: record.id,
      ...(author === null ? {} : { author }),
      created: timestamp(record.created),
      items: decodeChangelogItemsOption(record.items).pipe(
        Option.getOrElse((): ReadonlyArray<Schema.Json> => []),
        (items) =>
          items.flatMap((item) =>
            Option.toArray(decodeRecordOption(item)).map((fields) => {
              const text = (key: string) =>
                decodeStringOption(fields[key]).pipe(Option.getOrNull)
              return Object.assign({}, fields, {
                fieldId: text("fieldId"),
                field: text("field"),
                from: text("from"),
                to: text("to")
              })
            })
          )
      )
    }
  }
)
export type JiraChangelog = typeof JiraChangelog.Type

const JiraComponentValue = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: NullableString,
  lead: Schema.optional(Schema.NullOr(Schema.toType(JiraUser))),
  normalizationWarnings: NormalizationWarnings
})
export const JiraComponent = recoveredRecord(
  "component",
  lenientRecord({
    name: optionalJson,
    description: optionalJson,
    lead: optionalJson
  }),
  Schema.Struct({
    id: Schema.NonEmptyString,
    name: Schema.NonEmptyString,
    description: NullableString,
    lead: Schema.optional(StrictJiraUser)
  }),
  JiraComponentValue,
  (record) => {
    const description = decodeNullableStringOption(record.description)
    const lead = recoverJiraUser(record.lead)
    return {
      id: record.id,
      name: decodeNonEmptyStringOption(record.name).pipe(
        Option.getOrElse(() => record.id)
      ),
      ...(Option.isSome(description) ? { description: description.value } : {}),
      ...(lead === null ? {} : { lead })
    }
  }
)
export type JiraComponent = typeof JiraComponent.Type

const JiraVersionValue = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: NullableString,
  archived: Schema.optional(Schema.Boolean),
  released: Schema.optional(Schema.Boolean),
  startDate: NullableString,
  releaseDate: NullableString,
  normalizationWarnings: NormalizationWarnings
})
export const JiraVersion = recoveredRecord(
  "version",
  lenientRecord({
    name: optionalJson,
    description: optionalJson,
    archived: optionalJson,
    released: optionalJson,
    startDate: optionalJson,
    releaseDate: optionalJson
  }),
  Schema.Struct({
    id: Schema.NonEmptyString,
    name: Schema.NonEmptyString,
    description: NullableString,
    archived: Schema.optional(Schema.Boolean),
    released: Schema.optional(Schema.Boolean),
    startDate: NullableString,
    releaseDate: NullableString
  }),
  JiraVersionValue,
  (record) => {
    const text = (value: unknown) => decodeNullableStringOption(value)
    const flag = (value: unknown) => decodeBooleanOption(value)
    const description = text(record.description)
    const archived = flag(record.archived)
    const released = flag(record.released)
    const startDate = text(record.startDate)
    const releaseDate = text(record.releaseDate)
    return {
      id: record.id,
      name: decodeNonEmptyStringOption(record.name).pipe(
        Option.getOrElse(() => record.id)
      ),
      ...(Option.isSome(description) ? { description: description.value } : {}),
      ...(Option.isSome(archived) ? { archived: archived.value } : {}),
      ...(Option.isSome(released) ? { released: released.value } : {}),
      ...(Option.isSome(startDate) ? { startDate: startDate.value } : {}),
      ...(Option.isSome(releaseDate) ? { releaseDate: releaseDate.value } : {})
    }
  }
)
export type JiraVersion = typeof JiraVersion.Type

export const JiraWatchers = Schema.Struct({
  watchCount: Schema.Finite,
  isWatching: Schema.optional(Schema.Boolean),
  watchers: Schema.optional(RecoveredUsers)
})
export type JiraWatchers = typeof JiraWatchers.Type

export const JiraVotes = Schema.Struct({
  votes: Schema.Finite,
  hasVoted: Schema.optional(Schema.Boolean),
  voters: Schema.optional(RecoveredUsers)
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
