import * as Match from "effect/Match"
import { describe, expect, it } from "vitest"

import {
  EMPTY_LEGACY_LAYER,
  type LegacyLayer,
  type LegacyTemplate,
  legacyDefaultsFrom,
  legacyLayerFrom,
  planOrgLayer,
  planProjectLayer,
  withoutLegacyDefaults
} from "./typeMigration"

const template = (
  key: string,
  overrides: Partial<LegacyTemplate> = {}
): LegacyTemplate => ({
  key,
  name: `Template ${key}`,
  icon: "Siren",
  color: null,
  description: `About ${key}`,
  priority: "high",
  tags: [],
  body: `Body of ${key}`,
  ...overrides
})

const layer = (overrides: Partial<LegacyLayer>): LegacyLayer => ({
  ...EMPTY_LEGACY_LAYER,
  ...overrides
})

const summary = (steps: ReturnType<typeof planOrgLayer>["steps"]) =>
  steps.map((step) =>
    Match.value(step).pipe(
      Match.tag(
        "type",
        (typed) =>
          `${typed.template} -> ${typed.draft.key} (${typed.draft.name})`
      ),
      Match.orElse(
        (other) => `${other.template} -> ${other.key} [${other._tag}]`
      )
    )
  )

describe("legacy frontmatter", () => {
  it("reads default templates per ticket type and ignores the rest", () => {
    expect(
      legacyDefaultsFrom({
        templateDefaults: { bug: "incident", other: null, nope: "x", feat: 3 }
      })
    ).toEqual({ bug: "incident", other: null })
    expect(legacyDefaultsFrom({ templateDefaults: "broken" })).toEqual({})
  })

  it("removes only the default-template key", () => {
    expect(
      withoutLegacyDefaults({ note: "kept", templateDefaults: { bug: "x" } })
    ).toEqual({ note: "kept" })
  })

  it("sorts template files into definitions, tombstones and unreadable", () => {
    const legacy = legacyLayerFrom(
      [
        { key: "spike", content: "---\nname: Spike\n---\n\nBody\n" },
        { key: "gone", content: "---\nhidden: true\n---\n" },
        { key: "broken", content: "---\nicon: NotAnIcon\n---\n" }
      ],
      {}
    )

    expect(legacy.templates).toEqual([
      {
        key: "spike",
        name: "Spike",
        icon: "Square",
        color: null,
        description: "",
        priority: null,
        tags: [],
        body: "Body"
      }
    ])
    expect(legacy.hidden).toEqual(["gone"])
    expect(legacy.unreadable.map((file) => file.key)).toEqual(["broken"])
  })
})

describe("planOrgLayer", () => {
  it("turns the default for one type into that type, keeping the built-in look", () => {
    const plan = planOrgLayer(
      layer({
        templates: [template("bug-report", { tags: [] })],
        defaults: { bug: "bug-report" }
      })
    )

    expect(plan.steps).toEqual([
      {
        _tag: "type",
        template: "bug-report",
        from: "org",
        draft: {
          key: "bug",
          name: "Bug",
          icon: "Bug",
          color: "#f16f7e",
          description: "About bug-report",
          priority: "high",
          tags: [],
          body: "Body of bug-report"
        }
      }
    ])
    expect(plan.targets.get("bug-report")).toEqual(["bug"])
  })

  it("copies a default for several types to each and keeps other templates as their own type", () => {
    const plan = planOrgLayer(
      layer({
        templates: [template("shared"), template("spike"), template("triage")],
        defaults: {
          feat: "shared",
          chore: "shared",
          other: "triage",
          epic: null
        }
      })
    )

    expect(summary(plan.steps)).toEqual([
      "shared -> feat (Feature)",
      "shared -> chore (Chore)",
      "spike -> spike (Template spike)",
      "triage -> triage (Template triage)"
    ])
  })

  it("keeps a template that is the default for a type and for other as both", () => {
    const plan = planOrgLayer(
      layer({
        templates: [template("general")],
        defaults: { bug: "general", other: "general" }
      })
    )

    expect(summary(plan.steps)).toEqual([
      "general -> bug (Bug)",
      "general -> general (Template general)"
    ])
  })

  it("ignores a default that points at a template the layer lacks", () => {
    const plan = planOrgLayer(
      layer({ templates: [template("spike")], defaults: { bug: "ghost" } })
    )

    expect(summary(plan.steps)).toEqual(["spike -> spike (Template spike)"])
  })

  it("renames a template whose key is a built-in or reserved type key with the first free -N suffix", () => {
    const plan = planOrgLayer(
      layer({
        templates: [
          template("chore"),
          template("chore-2"),
          template("other"),
          template("feat")
        ],
        unreadable: [{ key: "blank", content: "raw" }],
        defaults: { feat: "feat" }
      })
    )

    expect(summary(plan.steps)).toEqual([
      "chore -> chore-3 (Template chore)",
      "chore-2 -> chore-2 (Template chore-2)",
      "feat -> feat (Feature)",
      "other -> other-2 (Template other)",
      "blank -> blank-2 [raw]"
    ])
  })
})

describe("planProjectLayer", () => {
  const org = layer({
    templates: [template("bug-report"), template("feature"), template("spike")],
    defaults: { bug: "bug-report", feat: "feature" }
  })
  const orgPlan = planOrgLayer(org)
  const plan = (project: Partial<LegacyLayer>) =>
    summary(planProjectLayer(layer(project), org, orgPlan).steps)

  it("plans nothing for a project that only inherits", () => {
    expect(plan({})).toEqual([])
  })

  it("maps an override of the inherited default to the same type", () => {
    expect(
      plan({ templates: [template("bug-report", { name: "Ours" })] })
    ).toEqual(["bug-report -> bug (Bug)"])
  })

  it("maps the project's own default and keeps the rest as project types", () => {
    expect(
      plan({
        templates: [template("incident"), template("retro")],
        defaults: { chore: "incident" }
      })
    ).toEqual(["incident -> chore (Chore)", "retro -> retro (Template retro)"])
  })

  it("copies an org template the project chose as default for another type", () => {
    expect(plan({ defaults: { chore: "spike", bug: "bug-report" } })).toEqual([
      "spike -> chore (Chore)"
    ])
  })

  it("keeps a hide for a custom type and drops it for a built-in type", () => {
    expect(plan({ hidden: ["feature", "spike", "ghost"] })).toEqual([
      "feature -> feat [unhidden]",
      "spike -> spike [tombstone]"
    ])
  })

  it("lets a definition win over a tombstone for the same type", () => {
    expect(
      plan({
        templates: [template("ours")],
        hidden: ["feature"],
        defaults: { feat: "ours" }
      })
    ).toEqual(["ours -> feat (Feature)"])
  })

  it("follows the org rename so an override keeps shadowing", () => {
    const renamedOrg = layer({ templates: [template("chore")] })
    const renamedPlan = planOrgLayer(renamedOrg)

    expect(
      summary(
        planProjectLayer(
          layer({ templates: [template("chore")], hidden: [] }),
          renamedOrg,
          renamedPlan
        ).steps
      )
    ).toEqual(["chore -> chore-2 (Template chore)"])
    expect(
      summary(
        planProjectLayer(layer({ hidden: ["chore"] }), renamedOrg, renamedPlan)
          .steps
      )
    ).toEqual(["chore -> chore-2 [tombstone]"])
  })
})
