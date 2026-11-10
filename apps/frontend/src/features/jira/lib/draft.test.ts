import { TagName } from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  buildJiraImportDraft,
  configurationBehind,
  fallbackTagName,
  toJiraImportConfiguration
} from "./draft"
import { testRequirements as requirements } from "./testRequirements"

const excluded = (draft: ReturnType<typeof buildJiraImportDraft>) => ({
  ...draft,
  review: { ...draft.review, restrictedContent: { policy: "exclude" as const } }
})

describe("buildJiraImportDraft", () => {
  it("applies every server suggestion and leaves the rest unlinked", () => {
    const { setup } = buildJiraImportDraft(requirements, null)

    expect(setup.identities.map((item) => item.projectProjectUserId)).toEqual([
      "user-ada",
      null,
      null
    ])
    expect(setup.priorities[0]?.projectPriority).toBe("high")
    expect(setup.tags[0]?.destinationTagName).toBe("component:web")
  })

  it("matches statuses by suggestion or by case-insensitive name", () => {
    const { setup } = buildJiraImportDraft(requirements, null)

    expect(setup.statuses.map((item) => item.projectStatusSlug)).toEqual([
      "in_progress",
      "done",
      undefined
    ])
  })

  it("maps issue types from suggestions and native names", () => {
    const { setup } = buildJiraImportDraft(requirements, null)

    expect(setup.issueTypes.map((item) => item.projectType)).toEqual([
      "feat",
      "bug",
      undefined
    ])
  })

  it("lets saved decisions win over suggestions", () => {
    const saved = toJiraImportConfiguration(
      excluded(buildJiraImportDraft(requirements, null))
    )
    expect(saved).not.toBeNull()
    if (saved === null) return
    const draft = buildJiraImportDraft(requirements, {
      ...saved,
      identities: [{ jiraAccountId: "jira-ada", projectProjectUserId: null }],
      tags: [
        {
          source: { kind: "component", value: "Web" },
          destinationTagName: TagName.make("frontend")
        }
      ]
    })

    expect(draft.setup.identities[0]?.projectProjectUserId).toBeNull()
    expect(draft.setup.tags[0]?.destinationTagName).toBe("frontend")
  })

  it("leaves restricted content out until someone chooses otherwise", () => {
    expect(
      buildJiraImportDraft(requirements, null).review.restrictedContent
    ).toEqual({ policy: "exclude" })
  })

  it("prefers a status with the same name over the server suggestion", () => {
    const { setup } = buildJiraImportDraft(
      {
        ...requirements,
        statuses: requirements.statuses.map((status) =>
          status.jiraStatusId === "status-done"
            ? {
                ...status,
                suggestedProjectStatusSlug:
                  requirements.statuses[0]?.suggestedProjectStatusSlug ?? null
              }
            : status
        )
      },
      null
    )

    expect(setup.statuses[1]?.projectStatusSlug).toBe("done")
  })
})

describe("toJiraImportConfiguration", () => {
  it("drops undecided rows, invalid tags and pending invites", () => {
    const draft = excluded(buildJiraImportDraft(requirements, null))
    const configuration = toJiraImportConfiguration({
      ...draft,
      setup: {
        ...draft.setup,
        identities: [
          ...draft.setup.identities.slice(0, 2),
          {
            jiraAccountId: "jira-cy",
            projectProjectUserId: null,
            inviteEmail: "not-an-email"
          }
        ]
      }
    })

    expect(configuration?.identities.map((item) => item.jiraAccountId)).toEqual(
      ["jira-ada", "jira-bob"]
    )
    expect(configuration?.statuses).toHaveLength(2)
    expect(configuration?.tags).toHaveLength(1)
    expect(configuration?.skippedAttachmentIds).toEqual(["attachment-1"])
    expect(configuration?.attachmentSkipsAccepted).toBe(true)
  })

  it("does not save while the destination is invalid", () => {
    const draft = excluded(buildJiraImportDraft(requirements, null))

    expect(
      toJiraImportConfiguration({
        ...draft,
        setup: {
          ...draft.setup,
          destination: { ...draft.setup.destination, key: "e" }
        }
      })
    ).toBeNull()
  })
})

describe("configurationBehind", () => {
  it("is behind until the saved configuration matches the draft", () => {
    const draft = buildJiraImportDraft(requirements, null)
    const saved = toJiraImportConfiguration(draft)

    expect(configurationBehind(draft, null)).toBe(true)
    expect(configurationBehind(draft, saved)).toBe(false)
  })
})

describe("skipped tags", () => {
  it("sends a valid placeholder name for a skipped tag without a suggestion", () => {
    const draft = excluded(buildJiraImportDraft(requirements, null))
    const configuration = toJiraImportConfiguration({
      ...draft,
      setup: {
        ...draft.setup,
        tags: draft.setup.tags.map((tag) => ({
          ...tag,
          skipped: true as const
        }))
      }
    })

    expect(configuration?.tags).toEqual([
      {
        source: { kind: "component", value: "Web" },
        destinationTagName: "component:web",
        skipped: true
      },
      {
        source: { kind: "label", value: "???" },
        destinationTagName: "tag",
        skipped: true
      }
    ])
    expect(
      configuration === null
        ? undefined
        : buildJiraImportDraft(requirements, configuration).setup.tags[1]
            ?.skipped
    ).toBe(true)
  })

  it("derives tag names the way tags are normalised", () => {
    expect(fallbackTagName({ kind: "label", value: "Front_End!" })).toBe(
      "front-end-"
    )
    expect(fallbackTagName({ kind: "component", value: "Web App" })).toBe(
      "component:web-app"
    )
  })
})
