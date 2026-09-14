import * as Schema from "effect/Schema"

const NullableString = Schema.optional(Schema.NullOr(Schema.String))
const NullableBoolean = Schema.optional(Schema.NullOr(Schema.Boolean))
const UnknownRecord = Schema.Record(Schema.String, Schema.Unknown)

export const JiraUser = Schema.Struct({
  accountId: Schema.String,
  displayName: Schema.String,
  emailAddress: NullableString,
  active: NullableBoolean,
  accountType: NullableString,
  avatarUrls: Schema.optional(UnknownRecord)
})
export type JiraUser = typeof JiraUser.Type

export const JiraProject = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
  description: Schema.optional(Schema.Unknown),
  projectTypeKey: NullableString,
  simplified: NullableBoolean,
  style: NullableString,
  lead: Schema.optional(JiraUser),
  avatarUrls: Schema.optional(UnknownRecord)
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
  issueType: JiraIssueType,
  statuses: Schema.Array(JiraStatus)
})
export type JiraIssueTypeStatuses = typeof JiraIssueTypeStatuses.Type

export const JiraField = Schema.Struct({
  id: Schema.String,
  key: Schema.optional(Schema.String),
  name: Schema.String,
  custom: Schema.optional(Schema.Boolean),
  schema: Schema.optional(Schema.Unknown)
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

export const JiraIssue = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  fields: UnknownRecord
})
export type JiraIssue = typeof JiraIssue.Type

export const JiraComment = Schema.Struct({
  id: Schema.String,
  body: Schema.Unknown,
  author: JiraUser,
  updateAuthor: Schema.optional(JiraUser),
  created: Schema.String,
  updated: NullableString,
  visibility: Schema.optional(Schema.Unknown)
})
export type JiraComment = typeof JiraComment.Type

export const JiraWorklog = Schema.Struct({
  id: Schema.String,
  author: JiraUser,
  updateAuthor: Schema.optional(JiraUser),
  comment: Schema.optional(Schema.Unknown),
  started: Schema.String,
  created: Schema.String,
  updated: Schema.String,
  timeSpentSeconds: Schema.Finite,
  visibility: Schema.optional(Schema.Unknown)
})
export type JiraWorklog = typeof JiraWorklog.Type

export const JiraChangelog = Schema.Struct({
  id: Schema.String,
  author: Schema.optional(JiraUser),
  created: Schema.String,
  items: Schema.Array(UnknownRecord)
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
  location: Schema.optional(Schema.Unknown)
})
export type JiraBoard = typeof JiraBoard.Type

export const JiraBoardConfiguration = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
  type: Schema.String,
  location: Schema.optional(Schema.Unknown),
  columnConfig: Schema.optional(Schema.Unknown),
  estimation: Schema.optional(Schema.Unknown),
  ranking: Schema.optional(Schema.Unknown),
  filter: Schema.optional(Schema.Unknown)
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
