import * as Schema from "effect/Schema"

import { EmailAddress } from "../organizations/OrgEmail"
import { CreatableProjectKey, Slug } from "../projects/Project"
import {
  StatusColor,
  StatusIcon,
  StatusLabel,
  StatusSlug
} from "../statuses/Status"
import { TagName } from "../tags/Tag"
import { StoredTicketType, TicketPriority } from "../tickets/Ticket"

export const JiraReconnectReason = Schema.Literals([
  "invalid_grant",
  "missing_scopes"
])
export type JiraReconnectReason = typeof JiraReconnectReason.Type

const JiraDisconnectedConnection = Schema.Struct({
  status: Schema.Literal("disconnected"),
  reconnectReason: Schema.Null,
  connectedAt: Schema.Null
})

const JiraConnectedConnection = Schema.Struct({
  status: Schema.Literal("connected"),
  reconnectReason: Schema.Null,
  connectedAt: Schema.DateTimeUtc
})

const JiraReconnectRequiredConnection = Schema.Struct({
  status: Schema.Literal("reconnect_required"),
  reconnectReason: JiraReconnectReason,
  connectedAt: Schema.DateTimeUtc
})

export const JiraConnection = Schema.Union([
  JiraDisconnectedConnection,
  JiraConnectedConnection,
  JiraReconnectRequiredConnection
])
export type JiraConnection = typeof JiraConnection.Type

export const JiraSite = Schema.Struct({
  cloudId: Schema.String,
  name: Schema.String,
  url: Schema.String,
  avatarUrl: Schema.NullOr(Schema.String)
})
export type JiraSite = typeof JiraSite.Type

export const JiraProjectChoice = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
  projectTypeKey: Schema.NullOr(Schema.String),
  simplified: Schema.NullOr(Schema.Boolean),
  style: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String)
})
export type JiraProjectChoice = typeof JiraProjectChoice.Type

export const JiraFailureReason = Schema.Literals([
  "network",
  "timeout",
  "invalid_response",
  "server_error",
  "refresh_contention",
  "bad_request",
  "cursor_expired",
  "unexpected_status",
  "decode_failed",
  "invalid_json",
  "invalid_redirect",
  "repeated_cursor",
  "oauth_state_invalid",
  "invalid_return_path",
  "credential_unreadable"
])
export type JiraFailureReason = typeof JiraFailureReason.Type

export const JiraMigrationStatus = Schema.Literals([
  "scanning",
  "needs_configuration",
  "ready",
  "migrating",
  "cancelling",
  "reconnect_required",
  "failed",
  "cancelled",
  "succeeded"
])
export type JiraMigrationStatus = typeof JiraMigrationStatus.Type

export const JiraMigrationConfiguration = Schema.Struct({
  destination: Schema.Struct({
    name: Schema.NonEmptyString,
    slug: Slug,
    key: CreatableProjectKey
  }),
  identities: Schema.Array(
    Schema.Struct({
      jiraAccountId: Schema.NonEmptyString,
      projectProjectUserId: Schema.NullOr(Schema.NonEmptyString),
      inviteEmail: Schema.optional(EmailAddress)
    }).check(
      Schema.makeFilter(
        (identity) =>
          identity.inviteEmail === undefined ||
          identity.projectProjectUserId === null
      )
    )
  ),
  statuses: Schema.Array(
    Schema.Struct({
      jiraStatusId: Schema.NonEmptyString,
      projectStatusSlug: StatusSlug,
      createStatus: Schema.optional(Schema.Literal(true))
    })
  ),
  issueTypes: Schema.Array(
    Schema.Struct({
      jiraIssueTypeId: Schema.NonEmptyString,
      projectType: StoredTicketType
    })
  ),
  priorities: Schema.Array(
    Schema.Struct({
      jiraPriorityId: Schema.NonEmptyString,
      projectPriority: TicketPriority
    })
  ),
  tags: Schema.Array(
    Schema.Struct({
      source: Schema.Struct({
        kind: Schema.Literals(["label", "component"]),
        value: Schema.NonEmptyString
      }),
      destinationTagName: TagName,
      skipped: Schema.optional(Schema.Literal(true))
    })
  ),
  activeFutureSprintChoices: Schema.Array(
    Schema.Struct({
      jiraIssueId: Schema.NonEmptyString,
      jiraSprintId: Schema.NullOr(Schema.NonEmptyString)
    })
  ),
  restrictedContent: Schema.NullOr(
    Schema.Union([
      Schema.Struct({ policy: Schema.Literal("exclude") }),
      Schema.Struct({
        policy: Schema.Literal("include"),
        disclosureAccepted: Schema.Literal(true)
      })
    ])
  ),
  skippedAttachmentIds: Schema.Array(Schema.NonEmptyString),
  attachmentSkipsAccepted: Schema.Boolean
})
export type JiraMigrationConfiguration = typeof JiraMigrationConfiguration.Type

const JiraMigrationCount = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0))
)

export const JiraMigrationCounts = Schema.Struct({
  identities: JiraMigrationCount,
  statuses: JiraMigrationCount,
  issueTypes: JiraMigrationCount,
  priorities: JiraMigrationCount,
  tags: JiraMigrationCount,
  issues: JiraMigrationCount,
  comments: JiraMigrationCount,
  attachments: JiraMigrationCount,
  groups: JiraMigrationCount,
  restrictions: JiraMigrationCount,
  epics: Schema.optional(JiraMigrationCount),
  subTickets: Schema.optional(JiraMigrationCount),
  sprints: Schema.optional(JiraMigrationCount)
})
export type JiraMigrationCounts = typeof JiraMigrationCounts.Type

export const JiraMigrationScanSummary = Schema.Struct({
  siteName: Schema.NonEmptyString,
  siteUrl: Schema.NonEmptyString,
  projectName: Schema.NonEmptyString,
  projectKey: Schema.NonEmptyString,
  scannedAt: Schema.DateTimeUtc,
  counts: JiraMigrationCounts,
  visibilityWarnings: Schema.Array(
    Schema.Struct({
      category: Schema.NonEmptyString,
      label: Schema.NonEmptyString,
      detail: Schema.NullOr(Schema.String)
    })
  )
})
export type JiraMigrationScanSummary = typeof JiraMigrationScanSummary.Type

export const JiraMigrationUserOption = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  imageUrl: Schema.NullOr(Schema.String)
})
export type JiraMigrationUserOption = typeof JiraMigrationUserOption.Type

export const JiraMigrationStatusOption = Schema.Struct({
  slug: StatusSlug,
  label: StatusLabel,
  icon: StatusIcon,
  color: StatusColor,
  isTerminal: Schema.Boolean
})
export type JiraMigrationStatusOption = typeof JiraMigrationStatusOption.Type

export const JiraMigrationRequirements = Schema.Struct({
  destination: Schema.Struct({
    suggestedName: Schema.NonEmptyString,
    suggestedSlug: Slug,
    suggestedKey: CreatableProjectKey
  }),
  identities: Schema.Array(
    Schema.Struct({
      jiraAccountId: Schema.NonEmptyString,
      displayName: Schema.NonEmptyString,
      email: Schema.NullOr(Schema.String),
      suggestedProjectProjectUserId: Schema.NullOr(Schema.NonEmptyString),
      assignedIssueCount: Schema.optional(JiraMigrationCount),
      reportedIssueCount: Schema.optional(JiraMigrationCount),
      commentCount: Schema.optional(JiraMigrationCount)
    })
  ),
  identityOptions: Schema.Array(JiraMigrationUserOption),
  statuses: Schema.Array(
    Schema.Struct({
      jiraStatusId: Schema.NonEmptyString,
      name: Schema.NonEmptyString,
      categoryKey: Schema.NullOr(Schema.String),
      suggestedProjectStatusSlug: Schema.NullOr(StatusSlug),
      issueCount: Schema.optional(JiraMigrationCount),
      createOption: Schema.NullOr(
        Schema.Struct({
          slug: StatusSlug,
          label: StatusLabel,
          icon: StatusIcon,
          color: StatusColor,
          isTerminal: Schema.Literal(false)
        })
      )
    })
  ),
  statusOptions: Schema.Array(JiraMigrationStatusOption),
  issueTypes: Schema.Array(
    Schema.Struct({
      jiraIssueTypeId: Schema.NonEmptyString,
      name: Schema.NonEmptyString,
      isSubtask: Schema.Boolean,
      suggestedProjectType: StoredTicketType,
      issueCount: Schema.optional(JiraMigrationCount)
    })
  ),
  priorities: Schema.Array(
    Schema.Struct({
      jiraPriorityId: Schema.NonEmptyString,
      name: Schema.NonEmptyString,
      suggestedProjectPriority: Schema.NullOr(TicketPriority),
      issueCount: Schema.optional(JiraMigrationCount)
    })
  ),
  tags: Schema.Array(
    Schema.Struct({
      source: Schema.Struct({
        kind: Schema.Literals(["label", "component"]),
        value: Schema.NonEmptyString
      }),
      suggestedDestinationTagName: Schema.NullOr(TagName),
      collisionSourceValues: Schema.Array(Schema.NonEmptyString),
      issueCount: Schema.optional(JiraMigrationCount)
    })
  ),
  activeFutureSprintChoices: Schema.Array(
    Schema.Struct({
      jiraIssueId: Schema.NonEmptyString,
      issueKey: Schema.NonEmptyString,
      issueSummary: Schema.NonEmptyString,
      options: Schema.Array(
        Schema.Struct({
          jiraSprintId: Schema.NonEmptyString,
          name: Schema.NonEmptyString,
          state: Schema.Literals(["active", "future"])
        })
      )
    })
  ),
  restrictedContent: Schema.Struct({
    issueCount: JiraMigrationCount,
    commentCount: JiraMigrationCount,
    worklogCount: JiraMigrationCount,
    issues: Schema.optional(
      Schema.Array(
        Schema.Struct({
          jiraIssueId: Schema.NonEmptyString,
          issueKey: Schema.NonEmptyString,
          issueSummary: Schema.String,
          childIssueKeys: Schema.Array(Schema.NonEmptyString)
        })
      )
    )
  }),
  attachments: Schema.Array(
    Schema.Struct({
      jiraAttachmentId: Schema.NonEmptyString,
      filename: Schema.NonEmptyString,
      byteSize: JiraMigrationCount,
      forcedSkipReason: Schema.NullOr(
        Schema.Literals(["too_large", "unsupported_type", "unavailable"])
      )
    })
  )
})
export type JiraMigrationRequirements = typeof JiraMigrationRequirements.Type

export const JiraMigrationProgress = Schema.Struct({
  phase: Schema.NonEmptyString,
  done: JiraMigrationCount,
  total: Schema.NullOr(JiraMigrationCount)
})
export type JiraMigrationProgress = typeof JiraMigrationProgress.Type

export const JiraMigrationActions = Schema.Struct({
  canConfigure: Schema.Boolean,
  canRun: Schema.Boolean,
  canRescan: Schema.Boolean,
  canCancel: Schema.Boolean,
  canRetry: Schema.Boolean,
  canDiscard: Schema.Boolean
})
export type JiraMigrationActions = typeof JiraMigrationActions.Type

export const JiraMigrationFailure = Schema.Struct({
  reason: Schema.NonEmptyString,
  retryable: Schema.Boolean,
  subject: Schema.optional(Schema.String),
  detail: Schema.optional(Schema.String)
})
export type JiraMigrationFailure = typeof JiraMigrationFailure.Type

export const JiraMigrationFinding = Schema.Struct({
  kind: Schema.NonEmptyString,
  subject: Schema.String,
  sourceId: Schema.NullOr(Schema.String),
  ticketId: Schema.NullOr(Schema.String),
  jiraUrl: Schema.NullOr(Schema.String),
  consequence: Schema.String
})
export type JiraMigrationFinding = typeof JiraMigrationFinding.Type

export const JiraMigrationResult = Schema.Struct({
  tickets: JiraMigrationCount,
  comments: JiraMigrationCount,
  attachmentsCopied: JiraMigrationCount,
  attachmentsSkipped: JiraMigrationCount,
  attachmentsFailed: JiraMigrationCount,
  peopleLinked: JiraMigrationCount,
  peopleInvited: JiraMigrationCount,
  peopleUnlinked: JiraMigrationCount,
  statusesCreated: JiraMigrationCount,
  findings: Schema.Array(JiraMigrationFinding)
})
export type JiraMigrationResult = typeof JiraMigrationResult.Type

export const JiraMigrationSummary = Schema.Struct({
  id: Schema.NonEmptyString,
  sourceCloudId: Schema.NonEmptyString,
  sourceProjectId: Schema.NonEmptyString,
  sourceProjectKey: Schema.NonEmptyString,
  sourceProjectName: Schema.NonEmptyString,
  status: JiraMigrationStatus,
  phase: Schema.NonEmptyString,
  revision: JiraMigrationCount,
  progress: JiraMigrationProgress,
  destinationProjectSlug: Schema.NullOr(Slug),
  destination: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        name: Schema.NonEmptyString,
        slug: Slug,
        key: Schema.NonEmptyString
      })
    )
  ),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc
})
export type JiraMigrationSummary = typeof JiraMigrationSummary.Type

export const JiraMigrationReport = Schema.Struct({
  migrationId: Schema.NonEmptyString,
  path: Schema.NonEmptyString,
  markdown: Schema.String
})
export type JiraMigrationReport = typeof JiraMigrationReport.Type

export const JiraMigrationDetail = Schema.Struct({
  ...JiraMigrationSummary.fields,
  scanSummary: Schema.NullOr(JiraMigrationScanSummary),
  requirements: Schema.NullOr(JiraMigrationRequirements),
  configuration: Schema.NullOr(JiraMigrationConfiguration),
  failedAttachmentIds: Schema.Array(Schema.NonEmptyString),
  actions: JiraMigrationActions,
  failure: Schema.NullOr(JiraMigrationFailure),
  findings: Schema.optional(Schema.Array(JiraMigrationFinding)),
  result: Schema.optional(JiraMigrationResult),
  scanCounts: Schema.optional(Schema.Record(Schema.String, JiraMigrationCount)),
  reportPath: Schema.NullOr(Schema.String),
  finishedAt: Schema.NullOr(Schema.DateTimeUtc)
})
export type JiraMigrationDetail = typeof JiraMigrationDetail.Type

export const JiraMigrationDestinationConflict = Schema.Struct({
  kind: Schema.Literals(["project_slug", "project_key", "ticket_id"]),
  value: Schema.NonEmptyString
})
export type JiraMigrationDestinationConflict =
  typeof JiraMigrationDestinationConflict.Type

export const JiraSkippedAttachment = Schema.Struct({
  sourceAttachmentId: Schema.NonEmptyString,
  filename: Schema.NonEmptyString,
  sourceIssueKey: Schema.NonEmptyString,
  targetTicketId: Schema.NonEmptyString,
  sourceIssueUrl: Schema.NonEmptyString,
  targetTicketUrl: Schema.NonEmptyString,
  replacement: Schema.Literals(["available", "too_large", "unsupported_type"])
})
export type JiraSkippedAttachment = typeof JiraSkippedAttachment.Type

export const CreateJiraMigrationInput = Schema.Struct({
  requestId: Schema.NonEmptyString,
  cloudId: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString
})
export type CreateJiraMigrationInput = typeof CreateJiraMigrationInput.Type

export const JiraMigrationRevisionInput = Schema.Struct({
  expectedRevision: JiraMigrationCount
})
export type JiraMigrationRevisionInput = typeof JiraMigrationRevisionInput.Type

export const ConfigureJiraMigrationInput = Schema.Struct({
  expectedRevision: JiraMigrationCount,
  configuration: JiraMigrationConfiguration
})
export type ConfigureJiraMigrationInput =
  typeof ConfigureJiraMigrationInput.Type
