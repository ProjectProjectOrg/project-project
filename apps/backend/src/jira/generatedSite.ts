import { Config, DateTime, Effect, Predicate, Schema, Stream } from "effect"

export type JiraFixtureFaults = Readonly<{
  rateLimit: number
  bareRateLimit: number
  serverError: number
  slow: number
  slowMs: number
  drop: number
  malformedComment: boolean
  unknownStatus: boolean
  missingAttachment: boolean
  sizeMismatch: boolean
  revokeAfterCalls: number
}>

export type JiraFixtureScale = Readonly<{
  seed: number
  issues: number
  users: number
  statuses: number
  labels: number
  components: number
  versions: number
  comments: number
  longThreadEvery: number
  longThreadLength: number
  changelogs: number
  worklogs: number
  attachments: number
  attachmentMaxBytes: number
  largeAttachments: number
  extraProjects: number
  latencyMs: number
  rollingGrant: boolean
  faults: JiraFixtureFaults
}>

export const defaultJiraFixtureScale: JiraFixtureScale = {
  seed: 172,
  issues: 40,
  users: 24,
  statuses: 9,
  labels: 24,
  components: 6,
  versions: 4,
  comments: 2,
  longThreadEvery: 0,
  longThreadLength: 150,
  changelogs: 3,
  worklogs: 1,
  attachments: 0.5,
  attachmentMaxBytes: 2 * 1024 * 1024,
  largeAttachments: 0,
  extraProjects: 0,
  latencyMs: 0,
  rollingGrant: false,
  faults: {
    rateLimit: 0,
    bareRateLimit: 0,
    serverError: 0,
    slow: 0,
    slowMs: 0,
    drop: 0,
    malformedComment: false,
    unknownStatus: false,
    missingAttachment: false,
    sizeMismatch: false,
    revokeAfterCalls: 0
  }
}

const number = (name: string, fallback: number) =>
  Config.Number(name).pipe(Config.withDefault(fallback))

const flag = (name: string, fallback: boolean) =>
  Config.Boolean(name).pipe(Config.withDefault(fallback))

export const jiraFixtureScaleConfig: Config.Config<JiraFixtureScale> =
  Config.all({
    seed: number("JIRA_FIXTURE_SEED", defaultJiraFixtureScale.seed),
    issues: number("JIRA_FIXTURE_ISSUES", defaultJiraFixtureScale.issues),
    users: number("JIRA_FIXTURE_USERS", defaultJiraFixtureScale.users),
    statuses: number("JIRA_FIXTURE_STATUSES", defaultJiraFixtureScale.statuses),
    labels: number("JIRA_FIXTURE_LABELS", defaultJiraFixtureScale.labels),
    components: number(
      "JIRA_FIXTURE_COMPONENTS",
      defaultJiraFixtureScale.components
    ),
    versions: number("JIRA_FIXTURE_VERSIONS", defaultJiraFixtureScale.versions),
    comments: number("JIRA_FIXTURE_COMMENTS", defaultJiraFixtureScale.comments),
    longThreadEvery: number(
      "JIRA_FIXTURE_LONG_THREAD_EVERY",
      defaultJiraFixtureScale.longThreadEvery
    ),
    longThreadLength: number(
      "JIRA_FIXTURE_LONG_THREAD_LENGTH",
      defaultJiraFixtureScale.longThreadLength
    ),
    changelogs: number(
      "JIRA_FIXTURE_CHANGELOGS",
      defaultJiraFixtureScale.changelogs
    ),
    worklogs: number("JIRA_FIXTURE_WORKLOGS", defaultJiraFixtureScale.worklogs),
    attachments: number(
      "JIRA_FIXTURE_ATTACHMENTS",
      defaultJiraFixtureScale.attachments
    ),
    attachmentMaxBytes: number(
      "JIRA_FIXTURE_ATTACHMENT_MAX_BYTES",
      defaultJiraFixtureScale.attachmentMaxBytes
    ),
    largeAttachments: number(
      "JIRA_FIXTURE_LARGE_ATTACHMENTS",
      defaultJiraFixtureScale.largeAttachments
    ),
    extraProjects: number(
      "JIRA_FIXTURE_EXTRA_PROJECTS",
      defaultJiraFixtureScale.extraProjects
    ),
    latencyMs: number(
      "JIRA_FIXTURE_LATENCY_MS",
      defaultJiraFixtureScale.latencyMs
    ),
    rollingGrant: flag("JIRA_FIXTURE_ROLLING_GRANT", true),
    faults: Config.all({
      rateLimit: number("JIRA_FIXTURE_P429", 0),
      bareRateLimit: number("JIRA_FIXTURE_P429_BARE", 0),
      serverError: number("JIRA_FIXTURE_P5XX", 0),
      slow: number("JIRA_FIXTURE_PSLOW", 0),
      slowMs: number("JIRA_FIXTURE_SLOW_MS", 25_000),
      drop: number("JIRA_FIXTURE_PDROP", 0),
      malformedComment: flag("JIRA_FIXTURE_MALFORMED_COMMENT", false),
      unknownStatus: flag("JIRA_FIXTURE_UNKNOWN_STATUS", false),
      missingAttachment: flag("JIRA_FIXTURE_MISSING_ATTACHMENT", false),
      sizeMismatch: flag("JIRA_FIXTURE_SIZE_MISMATCH", false),
      revokeAfterCalls: number("JIRA_FIXTURE_REVOKE_AFTER", 0)
    })
  })

const hash = (text: string) => {
  let value = 2166136261
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

export const fixtureUnit = (seed: number, key: string) => {
  let value = (hash(key) ^ seed) + 0x6d2b79f5
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

const MAX_CHILDREN = 999

const iso = (millis: number) => DateTime.formatIso(DateTime.makeUnsafe(millis))

export const GENERATED_PROJECT = {
  id: "20000",
  key: "GEN",
  name: "Generated Platform"
} as const

const SCRUM_BOARD = 200
const TEAM_BOARD = 201
const ATTACHMENT_BASE = 5_000_000
const ATTACHMENT_SLOTS = 20
const LARGE_ATTACHMENT_SLOT = ATTACHMENT_SLOTS - 1
const LARGE_ATTACHMENT_BYTES = 26 * 1024 * 1024

type JsonObject = Schema.JsonObject

export type GeneratedRoute = Readonly<
  | { kind: "json"; status: number; body: Schema.Json }
  | {
      kind: "bytes"
      contentType: string
      byteSize: number
      declaredSize: number
      missing: boolean
      bytes: (limit: number) => Stream.Stream<Uint8Array>
    }
>

const json = (body: Schema.Json, status = 200): GeneratedRoute => ({
  kind: "json",
  status,
  body
})

const notFound = json(
  { errorMessages: ["Issue does not exist or you do not have permission."] },
  404
)

const statusNames = [
  "To Do",
  "In Progress",
  "Done",
  "Backlog",
  "In Review",
  "Won't Do",
  "Selected for Development",
  "QA",
  "Released",
  "Blocked",
  "Ready for QA",
  "Closed"
]
const statusCategories = [
  { id: 2, key: "new", name: "To Do" },
  { id: 4, key: "indeterminate", name: "In Progress" },
  { id: 3, key: "done", name: "Done" }
] as const

const collidingLabels = [
  "front-end",
  "Front-End",
  "front_end",
  "FRONT.END",
  "backend",
  "Backend",
  "ui/ux",
  "ui-ux"
]

const mimeTypes = [
  ["image/png", "png"],
  ["application/pdf", "pdf"],
  ["text/plain", "txt"],
  ["image/jpeg", "jpg"],
  ["application/zip", "zip"],
  ["video/mp4", "mp4"]
] as const

const verbs = ["Ship", "Fix", "Refactor", "Document", "Investigate", "Design"]
const nouns = ["login flow", "billing export", "search index", "API gateway"]

export const buildGeneratedSite = (
  scale: JiraFixtureScale,
  siteUrl: string,
  cloudId: string
) => {
  const unit = (key: string) => fixtureUnit(scale.seed, key)
  const pick = (key: string, size: number) =>
    Math.min(size - 1, Math.floor(unit(key) * size))
  const exponential = (key: string, mean: number) =>
    mean <= 0
      ? 0
      : Math.min(
          MAX_CHILDREN,
          Math.floor(-mean * Math.log(1 - unit(key) * 0.999)),
          Math.ceil(mean * 6)
        )
  const api = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`
  const issueId = (index: number) => String(200_000 + index)
  const issueKey = (index: number) => `${GENERATED_PROJECT.key}-${index}`
  const issueIndex = (idOrKey: string) => {
    const keyed = idOrKey.match(/^GEN-(\d+)$/)
    const index = keyed ? Number(keyed[1]) : Number(idOrKey) - 200_000
    return Number.isInteger(index) && index >= 1 && index <= scale.issues
      ? index
      : null
  }

  const displayNameOf = (index: number) =>
    index === 5 || index === 6
      ? "Sam Taylor"
      : index === 7
        ? "Automation for Jira"
        : `Person ${index}`
  const user = (index: number): JsonObject => {
    const accountId = `gen-user-${index}`
    const displayName = displayNameOf(index)
    return {
      accountId,
      displayName,
      ...(index % 17 === 3 || index === 7
        ? {}
        : { emailAddress: `person.${index}@generated.example.test` }),
      active: index % 23 !== 4,
      accountType: index === 7 ? "app" : "atlassian",
      avatarUrls: { "48x48": `${siteUrl}/avatar/${accountId}.png` }
    }
  }
  const userIndexFor = (key: string) => pick(key, Math.max(1, scale.users))
  const userFor = (key: string) => user(userIndexFor(key))
  const distinctUser = (key: string, position: number) =>
    user(
      (pick(key, Math.max(1, scale.users)) + position) %
        Math.max(1, scale.users)
    )

  const statusCount = Math.max(3, scale.statuses)
  const statusName = (index: number) => statusNames[index] ?? `Stage ${index}`
  const status = (index: number): JsonObject => ({
    id: `gen-status-${index}`,
    name: statusName(index),
    description: `Generated status ${index}`,
    statusCategory: statusCategories[index % 3]
  })

  const issueTypes = [
    { id: "gen-type-story", name: "Story", subtask: false, hierarchyLevel: 0 },
    { id: "gen-type-bug", name: "Bug", subtask: false, hierarchyLevel: 0 },
    { id: "gen-type-task", name: "Task", subtask: false, hierarchyLevel: 0 },
    {
      id: "gen-type-initiative",
      name: "Initiative",
      subtask: false,
      hierarchyLevel: 1
    },
    {
      id: "gen-type-subtask",
      name: "Sub-task",
      subtask: true,
      hierarchyLevel: -1
    }
  ] as const

  const isEpic = (index: number) => index % 50 === 1
  const isSubtask = (index: number) => index % 10 === 0
  const issueType = (index: number) =>
    isEpic(index)
      ? issueTypes[3]
      : isSubtask(index)
        ? issueTypes[4]
        : issueTypes[pick(`type:${index}`, 3)]
  const parentOf = (index: number) => {
    if (isEpic(index)) return null
    if (isSubtask(index)) return index - 1
    const epic = index - ((index - 1) % 50)
    return epic !== index && unit(`epic:${index}`) < 0.7 ? epic : null
  }

  const label = (index: number) => collidingLabels[index] ?? `label-${index}`
  const component = (index: number): JsonObject => ({
    id: `gen-component-${index}`,
    name: `Component ${index}`,
    description: index % 2 === 0 ? `Owns area ${index}` : null,
    ...(index % 3 === 0 ? { lead: user(index % Math.max(1, scale.users)) } : {})
  })
  const version = (index: number): JsonObject => ({
    id: `gen-version-${index}`,
    name: `v${index + 1}.0`,
    description: index % 2 === 0 ? `Release ${index + 1}` : null,
    archived: index === 0,
    released: index < scale.versions / 2,
    startDate: `2025-${String((index % 12) + 1).padStart(2, "0")}-01`,
    releaseDate: `2025-${String((index % 12) + 1).padStart(2, "0")}-28`
  })

  const sprints = [
    ...Array.from({ length: 10 }, (_, offset) => ({
      board: SCRUM_BOARD,
      id: 2001 + offset,
      name: `GEN Sprint ${offset + 1}`,
      state: offset < 7 ? "closed" : offset === 7 ? "active" : "future"
    })),
    { board: TEAM_BOARD, id: 2011, name: "Team Sprint 1", state: "active" },
    { board: TEAM_BOARD, id: 2012, name: "Team Sprint 2", state: "future" }
  ]
  const sprintBody = (sprint: (typeof sprints)[number]): JsonObject => ({
    id: sprint.id,
    name: sprint.name,
    state: sprint.state,
    boardId: sprint.board,
    startDate:
      sprint.state === "future"
        ? null
        : `2026-0${(sprint.id % 9) + 1}-01T08:00:00.000Z`,
    endDate:
      sprint.state === "future"
        ? null
        : `2026-0${(sprint.id % 9) + 1}-14T08:00:00.000Z`,
    completeDate:
      sprint.state === "closed"
        ? `2026-0${(sprint.id % 9) + 1}-14T09:00:00.000Z`
        : null,
    goal: sprint.id % 2 === 0 ? `Goal for ${sprint.name}` : null
  })
  const sprintIdsOf = (index: number) => {
    const ids: Array<number> = []
    const slot = index % 10
    if (slot === 7 && index % 20 === 7) ids.push(2007)
    ids.push(2001 + slot)
    if (slot === 7 && index % 30 === 7) ids.push(2009)
    if (index % 41 === 0) ids.push(2011)
    if (index % 82 === 0) ids.push(2012)
    return ids
  }
  const sprintMembers = new Map<number, ReadonlyArray<number>>()
  const membersOf = (sprintId: number) => {
    const cached = sprintMembers.get(sprintId)
    if (cached) return cached
    const members: Array<number> = []
    for (let index = 1; index <= scale.issues; index++)
      if (sprintIdsOf(index).includes(sprintId)) members.push(index)
    sprintMembers.set(sprintId, members)
    return members
  }

  const text = (value: string): JsonObject => ({ type: "text", text: value })
  const paragraph = (...content: ReadonlyArray<Schema.Json>): JsonObject => ({
    type: "paragraph",
    content
  })
  const simpleAdf = (value: string): JsonObject => ({
    version: 1,
    type: "doc",
    content: [paragraph(text(value))]
  })
  const richAdf = (index: number): JsonObject => {
    const mentioned = userIndexFor(`mention:${index}`)
    return {
      version: 1,
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [text(`Context for ${issueKey(index)}`)]
        },
        paragraph(
          { type: "text", text: "bold", marks: [{ type: "strong" }] },
          text(" "),
          { type: "text", text: "italic", marks: [{ type: "em" }] },
          text(" "),
          { type: "text", text: "code", marks: [{ type: "code" }] },
          text(" "),
          { type: "text", text: "struck", marks: [{ type: "strike" }] },
          text(" "),
          { type: "text", text: "under", marks: [{ type: "underline" }] },
          text(" "),
          {
            type: "text",
            text: "red",
            marks: [{ type: "textColor", attrs: { color: "#ff5630" } }]
          },
          text(" "),
          {
            type: "text",
            text: "2",
            marks: [{ type: "subsup", attrs: { type: "sup" } }]
          },
          text(" "),
          {
            type: "text",
            text: "a link",
            marks: [
              { type: "link", attrs: { href: "https://example.test/doc" } }
            ]
          },
          { type: "hardBreak" },
          {
            type: "mention",
            attrs: {
              id: `gen-user-${mentioned}`,
              text: `@${displayNameOf(mentioned)}`
            }
          },
          text(" due "),
          { type: "date", attrs: { timestamp: "1767225600000" } },
          text(" "),
          {
            type: "status",
            attrs: { text: "IN REVIEW", color: "blue", localId: `st-${index}` }
          },
          text(" "),
          {
            type: "emoji",
            attrs: { shortName: ":rocket:", id: "1f680", text: "🚀" }
          },
          text(" "),
          {
            type: "inlineCard",
            attrs: {
              url: `${siteUrl}/browse/${issueKey(Math.max(1, index - 1))}`
            }
          }
        ),
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                paragraph(text("first")),
                {
                  type: "orderedList",
                  attrs: { order: 1 },
                  content: [
                    { type: "listItem", content: [paragraph(text("nested"))] }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [text(`const issue = "${issueKey(index)}"`)]
        },
        {
          type: "blockquote",
          content: [paragraph(text("Quoted requirement."))]
        },
        { type: "rule" },
        {
          type: "panel",
          attrs: { panelType: "warning" },
          content: [paragraph(text("Panel content."))]
        },
        {
          type: "expand",
          attrs: { title: "Details" },
          content: [paragraph(text("Hidden details."))]
        },
        {
          type: "table",
          attrs: { isNumberColumnEnabled: false, layout: "default" },
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableHeader", content: [paragraph(text("Field"))] },
                { type: "tableHeader", content: [paragraph(text("Value"))] }
              ]
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [paragraph(text("Owner"))] },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "nestedExpand",
                      attrs: { title: "More" },
                      content: [paragraph(text(displayNameOf(mentioned)))]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "taskList",
          attrs: { localId: `tl-${index}` },
          content: [
            {
              type: "taskItem",
              attrs: { localId: `ti-${index}-1`, state: "DONE" },
              content: [text("Write spec")]
            },
            {
              type: "taskItem",
              attrs: { localId: `ti-${index}-2`, state: "TODO" },
              content: [text("Review spec")]
            }
          ]
        },
        {
          type: "decisionList",
          attrs: { localId: `dl-${index}` },
          content: [
            {
              type: "decisionItem",
              attrs: { localId: `di-${index}`, state: "DECIDED" },
              content: [text("Use the generated fixture")]
            }
          ]
        },
        {
          type: "mediaSingle",
          attrs: { layout: "center" },
          content: [
            {
              type: "media",
              attrs: {
                id: `media-${index}-0000-4000-8000-000000000000`,
                type: "file",
                collection: `jira-${issueId(index)}`,
                width: 640,
                height: 480
              }
            }
          ]
        },
        {
          type: "mediaGroup",
          content: [
            {
              type: "media",
              attrs: {
                id: `media-${index}-0001-4000-8000-000000000000`,
                type: "file",
                collection: `jira-${issueId(index)}`
              }
            }
          ]
        },
        {
          type: "blockCard",
          attrs: { url: "https://example.test/design" }
        }
      ]
    }
  }

  const commentCount = (index: number) =>
    scale.longThreadEvery > 0 && index % scale.longThreadEvery === 3
      ? Math.min(MAX_CHILDREN, scale.longThreadLength)
      : exponential(`comments:${index}`, scale.comments)
  const changelogCount = (index: number) =>
    index % 300 === 7
      ? Math.min(MAX_CHILDREN, 250)
      : exponential(`changelogs:${index}`, scale.changelogs)
  const worklogCount = (index: number) =>
    index % 400 === 11
      ? Math.min(MAX_CHILDREN, 120)
      : exponential(`worklogs:${index}`, scale.worklogs)

  const comment = (index: number, position: number): JsonObject => {
    const malformed =
      scale.faults.malformedComment &&
      index === Math.min(3, scale.issues) &&
      position === 0
    return {
      id: String(10_000_000 + index * 1000 + position),
      body:
        position % 9 === 4
          ? richAdf(index)
          : simpleAdf(`Comment ${position + 1} on ${issueKey(index)}.`),
      ...(malformed
        ? {}
        : {
            author: userFor(`comment-author:${index}:${position}`),
            updateAuthor: userFor(`comment-author:${index}:${position}`)
          }),
      created: iso(
        Date.UTC(2025, 0, 1) + index * 3_600_000 + position * 60_000
      ),
      updated:
        position % 4 === 0
          ? null
          : iso(Date.UTC(2025, 0, 2) + index * 3_600_000 + position * 60_000),
      ...(position % 53 === 5
        ? {
            visibility: {
              type: "role",
              value: "Developers",
              identifier: "Developers"
            }
          }
        : {})
    }
  }
  const worklog = (index: number, position: number): JsonObject => ({
    id: String(30_000_000 + index * 1000 + position),
    issueId: issueId(index),
    author: userFor(`worklog-author:${index}:${position}`),
    ...(position % 3 === 0
      ? { comment: simpleAdf(`Worked on ${issueKey(index)}.`) }
      : {}),
    started: iso(Date.UTC(2025, 1, 1) + index * 3_600_000 + position * 600_000),
    created: iso(Date.UTC(2025, 1, 1) + index * 3_600_000 + position * 600_000),
    updated: iso(Date.UTC(2025, 1, 1) + index * 3_600_000 + position * 600_000),
    timeSpentSeconds: 900 * (1 + pick(`worklog-time:${index}:${position}`, 16)),
    ...(position % 37 === 2
      ? { visibility: { type: "group", value: "jira-admins" } }
      : {})
  })
  const changelog = (index: number, position: number): JsonObject => {
    const from = pick(`changelog-from:${index}:${position}`, statusCount)
    const to = pick(`changelog-to:${index}:${position}`, statusCount)
    return {
      id: String(20_000_000 + index * 1000 + position),
      ...(position % 29 === 13
        ? {}
        : { author: userFor(`changelog-author:${index}:${position}`) }),
      created: iso(
        Date.UTC(2025, 0, 1) + index * 3_600_000 + position * 120_000
      ),
      items:
        position % 3 === 0
          ? [
              {
                field: "status",
                fieldtype: "jira",
                fieldId: "status",
                from: `gen-status-${from}`,
                fromString: statusName(from),
                to: `gen-status-${to}`,
                toString: statusName(to)
              }
            ]
          : position % 3 === 1
            ? [
                {
                  field: "assignee",
                  fieldtype: "jira",
                  fieldId: "assignee",
                  from: null,
                  fromString: null,
                  to: `gen-user-${pick(`changelog-user:${index}:${position}`, Math.max(1, scale.users))}`,
                  toString: "Someone",
                  tmpToAccountId: `gen-user-${pick(`changelog-user:${index}:${position}`, Math.max(1, scale.users))}`
                }
              ]
            : [
                {
                  field: "labels",
                  fieldtype: "jira",
                  from: null,
                  fromString: "",
                  to: null,
                  toString: label(
                    pick(
                      `changelog-label:${index}:${position}`,
                      Math.max(1, scale.labels)
                    )
                  )
                }
              ]
    }
  }

  const largeAttachmentIssues = new Set(
    Array.from({ length: Math.max(0, scale.largeAttachments) }, (_, offset) =>
      Math.max(
        1,
        Math.floor((scale.issues * (offset + 1)) / (scale.largeAttachments + 1))
      )
    )
  )
  const attachmentCount = (index: number) =>
    Math.min(
      LARGE_ATTACHMENT_SLOT - 1,
      exponential(`attachments:${index}`, scale.attachments)
    ) + (index === 1 ? 1 : 0)
  const firstIssuesWithAttachments = (() => {
    const found: Array<number> = []
    for (let index = 2; index <= scale.issues && found.length < 2; index++)
      if (attachmentCount(index) > 0) found.push(index)
    return found
  })()
  const missingAttachmentId =
    scale.faults.missingAttachment &&
    firstIssuesWithAttachments[0] !== undefined
      ? String(
          ATTACHMENT_BASE + firstIssuesWithAttachments[0] * ATTACHMENT_SLOTS
        )
      : null
  const mismatchAttachmentId =
    scale.faults.sizeMismatch && firstIssuesWithAttachments[1] !== undefined
      ? String(
          ATTACHMENT_BASE + firstIssuesWithAttachments[1] * ATTACHMENT_SLOTS
        )
      : null

  type AttachmentMeta = Readonly<{
    id: string
    filename: string
    mimeType: string
    size: number
    author: JsonObject
  }>
  const attachmentMeta = (
    index: number,
    slot: number
  ): AttachmentMeta | null => {
    const large = slot === LARGE_ATTACHMENT_SLOT
    if (
      large ? !largeAttachmentIssues.has(index) : slot >= attachmentCount(index)
    )
      return null
    const id = String(ATTACHMENT_BASE + index * ATTACHMENT_SLOTS + slot)
    const [mimeType, extension] = large
      ? (["application/zip", "zip"] as const)
      : mimeTypes[pick(`attachment-type:${index}:${slot}`, mimeTypes.length)]
    const size = large
      ? LARGE_ATTACHMENT_BYTES +
        pick(`attachment-size:${index}`, 8 * 1024 * 1024)
      : index === 1 && slot === 0
        ? 0
        : 256 +
          Math.floor(
            unit(`attachment-size:${index}:${slot}`) ** 3 *
              Math.max(0, scale.attachmentMaxBytes - 256)
          )
    return {
      id,
      filename: `${issueKey(index).toLowerCase()}-file-${slot}.${extension}`,
      mimeType,
      size,
      author: userFor(`attachment-author:${index}:${slot}`)
    }
  }
  const attachmentsOf = (index: number) =>
    Array.from({ length: ATTACHMENT_SLOTS }, (_, slot) =>
      attachmentMeta(index, slot)
    ).filter(Predicate.isNotNull)

  const linksOf = (index: number): ReadonlyArray<JsonObject> => {
    const reference = (target: number) => ({
      id: issueId(target),
      key: issueKey(target),
      fields: { summary: `Issue ${target}` }
    })
    const blocks = {
      id: "10000",
      name: "Blocks",
      inward: "is blocked by",
      outward: "blocks"
    }
    const relates = {
      id: "10003",
      name: "Relates",
      inward: "relates to",
      outward: "relates to"
    }
    const links: Array<JsonObject> = []
    if (index % 7 === 0 && index > 1)
      links.push({
        id: `gl-b-${index}`,
        type: blocks,
        outwardIssue: reference(index - 1)
      })
    if ((index + 1) % 7 === 0 && index + 1 <= scale.issues)
      links.push({
        id: `gl-b-${index + 1}`,
        type: blocks,
        inwardIssue: reference(index + 1)
      })
    if (index % 13 === 0 && index < scale.issues)
      links.push({
        id: `gl-r-${index}`,
        type: relates,
        inwardIssue: reference(index + 1)
      })
    if ((index - 1) % 13 === 0 && index > 1)
      links.push({
        id: `gl-r-${index - 1}`,
        type: relates,
        outwardIssue: reference(index - 1)
      })
    if (index === 5)
      links.push({
        id: "gl-cross-1",
        type: relates,
        outwardIssue: {
          id: "10001",
          key: "APP-1",
          fields: { summary: "Ship browser migration harness" }
        }
      })
    return links
  }

  const issue = (index: number): JsonObject => {
    const type = issueType(index)
    const statusIndex = pick(`status:${index}`, statusCount)
    const parent = parentOf(index)
    const comments = commentCount(index)
    const worklogs = worklogCount(index)
    const watchers = Math.min(
      pick(`watchers:${index}`, 6),
      Math.max(1, scale.users)
    )
    const votes = Math.min(pick(`votes:${index}`, 4), Math.max(1, scale.users))
    const labelCount = pick(`label-count:${index}`, 4)
    const componentCount = pick(`component-count:${index}`, 3)
    const sprintIds = sprintIdsOf(index)
    return {
      id: issueId(index),
      key: issueKey(index),
      self: `${api}/issue/${issueId(index)}`,
      fields: {
        summary: `${verbs[index % verbs.length]} ${nouns[index % nouns.length]} ${index}`,
        description:
          index % 10 === 1
            ? richAdf(index)
            : index % 31 === 0
              ? null
              : simpleAdf(`Description of ${issueKey(index)}.`),
        status:
          scale.faults.unknownStatus && index === Math.min(2, scale.issues)
            ? {
                id: "gen-status-missing",
                name: "Legacy Triage",
                statusCategory: statusCategories[0]
              }
            : status(statusIndex),
        issuetype: type,
        priority:
          index % 7 === 0
            ? null
            : index % 2 === 0
              ? { id: "priority-1", name: "High" }
              : { id: "priority-2", name: "Medium" },
        assignee:
          unit(`assignee:${index}`) < 0.2 ? null : userFor(`assignee:${index}`),
        reporter: userFor(`reporter:${index}`),
        creator: userFor(`reporter:${index}`),
        labels: [
          ...new Set(
            Array.from({ length: labelCount }, (_, offset) =>
              label(pick(`label:${index}:${offset}`, Math.max(1, scale.labels)))
            )
          )
        ],
        components:
          scale.components === 0
            ? []
            : [
                ...new Set(
                  Array.from({ length: componentCount }, (_, offset) =>
                    pick(`component:${index}:${offset}`, scale.components)
                  )
                )
              ].map((value) => ({
                id: `gen-component-${value}`,
                name: `Component ${value}`
              })),
        fixVersions:
          scale.versions === 0 || index % 3 !== 0
            ? []
            : [
                {
                  id: `gen-version-${pick(`fix:${index}`, scale.versions)}`,
                  name: "fix"
                }
              ],
        versions:
          scale.versions === 0 || index % 5 !== 0
            ? []
            : [
                {
                  id: `gen-version-${pick(`affects:${index}`, scale.versions)}`,
                  name: "affects"
                }
              ],
        attachment: attachmentsOf(index).map((attachment) => ({
          id: attachment.id,
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          size: attachment.size,
          content: `${api}/attachment/content/${attachment.id}`,
          self: `${api}/attachment/${attachment.id}`,
          author: attachment.author,
          created: iso(Date.UTC(2025, 2, 1) + index * 3_600_000)
        })),
        issuelinks: linksOf(index),
        subtasks:
          isSubtask(index + 1) && index + 1 <= scale.issues
            ? [{ id: issueId(index + 1), key: issueKey(index + 1) }]
            : [],
        ...(parent === null
          ? {}
          : {
              parent: {
                id: issueId(parent),
                key: issueKey(parent),
                fields: {
                  summary: `Issue ${parent}`,
                  issuetype: issueType(parent)
                }
              }
            }),
        security:
          index % 97 === 0
            ? { id: "gen-security-1", name: "Confidential" }
            : null,
        customfield_10001: `0|i${index.toString(36).padStart(5, "0")}:`,
        customfield_10020: sprints
          .filter((sprint) => sprintIds.includes(sprint.id))
          .map(sprintBody),
        customfield_10030: index % 4 === 0 ? null : pick(`points:${index}`, 13),
        customfield_10040:
          index % 6 === 0 ? { id: "gen-option-1", value: "Customer" } : null,
        environment:
          index % 11 === 0 ? simpleAdf("Production, eu-west-1") : null,
        duedate: index % 9 === 0 ? "2026-12-31" : null,
        resolution:
          statusIndex % 3 === 2 ? { id: "10000", name: "Done" } : null,
        timetracking:
          index % 8 === 0 ? { originalEstimateSeconds: 28_800 } : {},
        comment: {
          comments: Array.from(
            { length: Math.min(20, comments) },
            (_, position) => comment(index, position)
          ),
          maxResults: Math.min(20, comments),
          total: comments,
          startAt: 0
        },
        worklog: {
          worklogs: Array.from(
            { length: Math.min(20, worklogs) },
            (_, position) => worklog(index, position)
          ),
          maxResults: 20,
          total: worklogs,
          startAt: 0
        },
        watches: {
          watchCount: watchers,
          isWatching: false,
          self: `${api}/issue/${issueKey(index)}/watchers`
        },
        votes: {
          votes,
          hasVoted: false,
          self: `${api}/issue/${issueKey(index)}/votes`
        },
        created: iso(Date.UTC(2024, 0, 1) + index * 3_600_000),
        updated: iso(Date.UTC(2025, 6, 1) + index * 60_000)
      }
    }
  }

  const offset = (
    field: string,
    startAt: number,
    maxResults: number,
    total: number,
    item: (position: number) => Schema.Json,
    withIsLast = true
  ) => {
    const size = Math.max(1, Math.min(100, maxResults))
    const end = Math.min(total, startAt + size)
    return json({
      [field]: Array.from(
        { length: Math.max(0, end - startAt) },
        (_, position) => item(startAt + position)
      ),
      startAt,
      maxResults: size,
      total,
      ...(withIsLast ? { isLast: end >= total } : {})
    })
  }

  const projectBody = (): JsonObject => ({
    id: GENERATED_PROJECT.id,
    key: GENERATED_PROJECT.key,
    name: GENERATED_PROJECT.name,
    description: simpleAdf("Generated project for scale and fault testing."),
    projectTypeKey: "software",
    simplified: false,
    style: "classic",
    lead: user(0),
    avatarUrls: { "48x48": `${siteUrl}/avatar/generated.png` }
  })

  const extraProject = (index: number): JsonObject => ({
    id: String(30_000 + index),
    key: `PRJ${index}`,
    name: `Portfolio ${index}`,
    projectTypeKey: index % 4 === 0 ? "business" : "software",
    simplified: index % 3 === 0,
    style: index % 3 === 0 ? "next-gen" : "classic",
    avatarUrls: { "48x48": `${siteUrl}/avatar/portfolio-${index}.png` }
  })
  const extraProjectIndex = (idOrKey: string) => {
    const keyed = idOrKey.match(/^PRJ(\d+)$/)
    const index = keyed ? Number(keyed[1]) : Number(idOrKey) - 30_000
    return Number.isInteger(index) && index >= 0 && index < scale.extraProjects
      ? index
      : null
  }

  const projects = (first: JsonObject) => {
    const all = (startAt: number, maxResults: number) => {
      const size = Math.max(1, Math.min(50, maxResults))
      const total = 2 + scale.extraProjects
      const values = Array.from(
        { length: Math.max(0, Math.min(total, startAt + size) - startAt) },
        (_, position) => {
          const index = startAt + position
          return index === 0
            ? first
            : index === 1
              ? projectBody()
              : extraProject(index - 2)
        }
      )
      return json({
        values,
        startAt,
        maxResults: size,
        total,
        isLast: startAt + size >= total
      })
    }
    return all
  }

  const attachmentRoute = (id: string): GeneratedRoute => {
    const numeric = Number(id) - ATTACHMENT_BASE
    const index = Math.floor(numeric / ATTACHMENT_SLOTS)
    const meta =
      Number.isInteger(numeric) && index >= 1 && index <= scale.issues
        ? attachmentMeta(index, numeric % ATTACHMENT_SLOTS)
        : null
    if (meta === null) return notFound
    const byteSize = id === mismatchAttachmentId ? meta.size + 17 : meta.size
    const chunkSize = 64 * 1024
    return {
      kind: "bytes",
      contentType: meta.mimeType,
      byteSize,
      declaredSize: meta.size,
      missing: id === missingAttachmentId,
      bytes: (limit) =>
        Stream.unfold(0, (position) =>
          Effect.sync(() => {
            const end = Math.min(byteSize, limit)
            if (position >= end) return undefined
            const length = Math.min(chunkSize, end - position)
            const chunk = new Uint8Array(length)
            for (let offset = 0; offset < length; offset++)
              chunk[offset] = (position + offset + Number(id)) & 0xff
            return [chunk, position + length] as const
          })
        )
    }
  }

  const route = (
    method: "GET" | "POST",
    url: URL,
    body: Schema.Json | undefined,
    smallProject: Readonly<{ id: string; key: string; body: JsonObject }>
  ): GeneratedRoute | null => {
    const path = url.pathname
    const startAt = Number(url.searchParams.get("startAt") ?? "0")
    const maxResults = Number(url.searchParams.get("maxResults") ?? "50")
    if (path.endsWith("/project/search"))
      return projects(smallProject.body)(startAt, maxResults)
    const attachment = path.match(/\/attachment\/content\/([^/]+)$/)
    if (attachment) {
      const id = decodeURIComponent(attachment[1])
      return Number(id) >= ATTACHMENT_BASE ? attachmentRoute(id) : null
    }
    if (path.endsWith("/search/jql") && method === "POST") {
      const request = Predicate.isObject(body) ? body : {}
      const jql = Predicate.isString(request.jql) ? request.jql : ""
      const target = jql.match(/project\s*=\s*"?([^"\s]+)"?/i)?.[1] ?? ""
      if (target === smallProject.id || target === smallProject.key) return null
      const generated =
        target === GENERATED_PROJECT.id || target === GENERATED_PROJECT.key
      const token = Predicate.isString(request.nextPageToken)
        ? request.nextPageToken
        : null
      const from = token === null ? 0 : Number(token.replace(/^gen-page-/, ""))
      const size = Math.max(
        1,
        Math.min(
          100,
          Predicate.isNumber(request.maxResults) ? request.maxResults : 50
        )
      )
      const total = generated ? scale.issues : 0
      const end = Math.min(total, from + size)
      return json({
        issues: Array.from({ length: Math.max(0, end - from) }, (_, position) =>
          issue(from + position + 1)
        ),
        ...(end < total ? { nextPageToken: `gen-page-${end}` } : {}),
        isLast: end >= total
      })
    }
    const boardSprintIssues = path.match(
      /\/board\/(\d+)\/sprint\/(\d+)\/issue$/
    )
    if (boardSprintIssues) {
      const board = Number(boardSprintIssues[1])
      if (board !== SCRUM_BOARD && board !== TEAM_BOARD) return null
      const members = membersOf(Number(boardSprintIssues[2]))
      const token = url.searchParams.get("nextPageToken")
      const from =
        token === null ? 0 : Number(token.replace(/^gen-sprint-/, ""))
      const end = Math.min(members.length, from + 100)
      return json({
        issues: members
          .slice(from, end)
          .map((index) => ({ id: issueId(index), key: issueKey(index) })),
        ...(end < members.length ? { nextPageToken: `gen-sprint-${end}` } : {})
      })
    }
    const sprintList = path.match(/\/board\/(\d+)\/sprint$/)
    if (sprintList) {
      const board = Number(sprintList[1])
      if (board !== SCRUM_BOARD && board !== TEAM_BOARD) return null
      const values = sprints.filter((sprint) => sprint.board === board)
      return offset("values", startAt, maxResults, values.length, (position) =>
        sprintBody(values[position])
      )
    }
    const boardConfiguration = path.match(/\/board\/(\d+)\/configuration$/)
    if (boardConfiguration) {
      const board = Number(boardConfiguration[1])
      if (board !== SCRUM_BOARD && board !== TEAM_BOARD) return null
      return json({
        id: board,
        name: board === SCRUM_BOARD ? "GEN board" : "GEN team board",
        type: board === SCRUM_BOARD ? "scrum" : "simple",
        location: {
          projectId: Number(GENERATED_PROJECT.id),
          projectKey: GENERATED_PROJECT.key
        },
        columnConfig: {
          columns: statusCategories.map((category, column) => ({
            name: category.name,
            statuses: Array.from({ length: statusCount }, (_, index) => index)
              .filter((index) => index % 3 === column)
              .map((index) => ({ id: `gen-status-${index}` }))
          }))
        },
        ranking: { rankCustomFieldId: 10001 },
        estimation: {
          type: "field",
          field: { fieldId: "customfield_10030", displayName: "Story Points" }
        }
      })
    }
    if (path.endsWith("/board")) {
      const target = url.searchParams.get("projectKeyOrId") ?? ""
      if (target === smallProject.id || target === smallProject.key) return null
      const boards =
        target === GENERATED_PROJECT.id || target === GENERATED_PROJECT.key
          ? [
              { id: SCRUM_BOARD, name: "GEN board", type: "scrum" },
              { id: TEAM_BOARD, name: "GEN team board", type: "simple" }
            ]
          : []
      return offset(
        "values",
        startAt,
        maxResults,
        boards.length,
        (position) => ({
          ...boards[position],
          location: {
            projectId: Number(GENERATED_PROJECT.id),
            projectKey: GENERATED_PROJECT.key
          }
        })
      )
    }
    const issueChild = path.match(
      /\/issue\/([^/]+)\/(comment|worklog|changelog|watchers|votes)$/
    )
    if (issueChild) {
      const idOrKey = decodeURIComponent(issueChild[1])
      if (
        idOrKey === "10001" ||
        idOrKey === "10002" ||
        idOrKey.startsWith("APP-")
      )
        return null
      const index = issueIndex(idOrKey)
      if (index === null) return notFound
      switch (issueChild[2]) {
        case "comment":
          return offset(
            "comments",
            startAt,
            maxResults,
            commentCount(index),
            (position) => comment(index, position),
            false
          )
        case "worklog":
          return offset(
            "worklogs",
            startAt,
            maxResults,
            worklogCount(index),
            (position) => worklog(index, position),
            false
          )
        case "changelog":
          return offset(
            "values",
            startAt,
            maxResults,
            changelogCount(index),
            (position) => changelog(index, position)
          )
        case "watchers": {
          const count = Math.min(
            pick(`watchers:${index}`, 6),
            Math.max(1, scale.users)
          )
          return json({
            watchCount: count,
            isWatching: false,
            watchers: Array.from({ length: count }, (_, position) =>
              distinctUser(`watcher:${index}`, position)
            )
          })
        }
        default: {
          const count = Math.min(
            pick(`votes:${index}`, 4),
            Math.max(1, scale.users)
          )
          return json({
            votes: count,
            hasVoted: false,
            voters: Array.from({ length: count }, (_, position) =>
              distinctUser(`voter:${index}`, position)
            )
          })
        }
      }
    }
    const projectPath = path.match(
      /\/project\/([^/]+)(?:\/(statuses|component|version))?$/
    )
    if (projectPath) {
      const idOrKey = decodeURIComponent(projectPath[1])
      if (idOrKey === smallProject.id || idOrKey === smallProject.key)
        return null
      const generated =
        idOrKey === GENERATED_PROJECT.id || idOrKey === GENERATED_PROJECT.key
      const extra = generated ? null : extraProjectIndex(idOrKey)
      if (!generated && extra === null) return notFound
      switch (projectPath[2]) {
        case "statuses":
          return json(
            (generated ? issueTypes : issueTypes.slice(0, 1)).map((type) => ({
              id: type.id,
              name: type.name,
              subtask: type.subtask,
              statuses: Array.from(
                { length: generated ? statusCount : 3 },
                (_, index) => status(index)
              )
            }))
          )
        case "component":
          return offset(
            "values",
            startAt,
            maxResults,
            generated ? scale.components : 0,
            component
          )
        case "version":
          return offset(
            "values",
            startAt,
            maxResults,
            generated ? scale.versions : 0,
            version
          )
        default:
          return json(generated ? projectBody() : extraProject(extra ?? 0))
      }
    }
    return null
  }

  return {
    route,
    issue,
    attachmentsOf,
    missingAttachmentId,
    mismatchAttachmentId
  }
}

export type GeneratedSite = ReturnType<typeof buildGeneratedSite>
