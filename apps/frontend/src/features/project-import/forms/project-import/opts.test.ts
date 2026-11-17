import type { ProjectImport } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { defaultProjectImportValues } from "./opts"

const imported = (
  source: NonNullable<ProjectImport["source"]>
): ProjectImport => ({
  id: "import-1",
  status: "ready",
  source,
  counts: {
    tickets: 3,
    groups: 1,
    attachments: 0,
    missingAttachments: 0,
    activity: 4
  },
  people: [
    {
      id: "source-ada",
      name: "Ada",
      email: "ada@example.com",
      image: null,
      suggestedUserId: "user-ada"
    },
    {
      id: "source-bob",
      name: "Bob",
      email: "bob@example.com",
      image: null,
      suggestedUserId: null
    }
  ],
  types: [],
  integrations: [],
  destination: null,
  failureReason: null
})

describe("defaultProjectImportValues", () => {
  it("starts from the source project and preselects suggested members", () => {
    expect(
      defaultProjectImportValues(
        imported({
          url: null,
          name: "Mobile App",
          key: "MOB",
          slug: "mobile-app"
        })
      )
    ).toEqual({
      destination: { name: "Mobile App", slug: "mobile-app", key: "MOB" },
      people: [
        { sourceUserId: "source-ada", userId: "user-ada" },
        { sourceUserId: "source-bob", userId: null }
      ]
    })
  })

  it("derives a key from the name when the source key can't be created", () => {
    expect(
      defaultProjectImportValues(
        imported({ url: null, name: "Mobile App", key: "T", slug: "mobile" })
      ).destination.key
    ).toBe("MA")
  })
})
