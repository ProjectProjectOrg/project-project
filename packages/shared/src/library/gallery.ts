import * as Schema from "effect/Schema"

import {
  BlockDraft,
  type BlockIcon,
  TemplateDefaults,
  TemplateDraft
} from "../schemas/Library"
import { formatTicketBlock } from "../ticketBlocks"

type BlockSource = Readonly<{
  key: string
  name: string
  icon: BlockIcon
  description: string
  sync: boolean
  content: string
}>

type TemplateSource = Readonly<{
  key: string
  name: string
  icon: BlockIcon
  description: string
  body: string
}>

const lines = (...parts: ReadonlyArray<string>): string => parts.join("\n")

const references = (...keys: ReadonlyArray<string>): string =>
  keys.map((key) => formatTicketBlock(key, "")).join("\n\n")

const customized = (key: string, content: string): string =>
  formatTicketBlock(key, content)

const body = (...parts: ReadonlyArray<string>): string => parts.join("\n\n")

const BLOCK_SOURCES: ReadonlyArray<BlockSource> = [
  {
    key: "context",
    name: "Context",
    icon: "FileText",
    description: "Why this ticket exists",
    sync: false,
    content: lines(
      "## Context",
      "",
      "{{Why this ticket exists: the problem, what triggered it, links to earlier discussion.}}"
    )
  },
  {
    key: "user-story",
    name: "User story",
    icon: "UserRound",
    description: "Who wants what, and why",
    sync: false,
    content: lines(
      "## User story",
      "",
      "{{As a [kind of user], I want [capability], so that [outcome].}}"
    )
  },
  {
    key: "acceptance-criteria",
    name: "Acceptance criteria",
    icon: "ListChecks",
    description: "What must be true for this to be done",
    sync: false,
    content: lines(
      "## Acceptance criteria",
      "",
      "- [ ] {{Given a starting state, when something happens, then this is true}}",
      "- [ ] {{Another observable outcome}}"
    )
  },
  {
    key: "definition-of-done",
    name: "Definition of done",
    icon: "CircleCheckBig",
    description: "The team's bar for done",
    sync: true,
    content: lines(
      "## Definition of done",
      "",
      "- [ ] Reviewed and merged",
      "- [ ] Tests cover the change",
      "- [ ] Docs updated where behaviour changed",
      "- [ ] Verified in the target environment"
    )
  },
  {
    key: "steps-to-reproduce",
    name: "Steps to reproduce",
    icon: "Footprints",
    description: "How someone else can see the bug",
    sync: false,
    content: lines(
      "## Steps to reproduce",
      "",
      "1. {{Where you start}}",
      "2. {{What you do}}",
      "3. {{What you see}}",
      "",
      "{{How often: always, sometimes, only when…}}"
    )
  },
  {
    key: "expected-vs-actual",
    name: "Expected vs actual",
    icon: "GitCompareArrows",
    description: "What should happen and what happens instead",
    sync: false,
    content: lines(
      "## Expected vs actual",
      "",
      "**Expected:** {{what should happen}}",
      "",
      "**Actual:** {{what happens instead}}"
    )
  },
  {
    key: "environment",
    name: "Environment",
    icon: "MonitorSmartphone",
    description: "Where it happens",
    sync: false,
    content: lines(
      "## Environment",
      "",
      "- **Where:** {{production, staging or local}}",
      "- **Version:** {{release or commit}}",
      "- **Platform:** {{OS, browser, device}}"
    )
  },
  {
    key: "approach",
    name: "Approach",
    icon: "Compass",
    description: "How you plan to solve it",
    sync: false,
    content: lines(
      "## Approach",
      "",
      "{{How you'll solve it, and the alternatives you ruled out.}}"
    )
  },
  {
    key: "out-of-scope",
    name: "Out of scope",
    icon: "Ban",
    description: "What this deliberately leaves out",
    sync: false,
    content: lines(
      "## Out of scope",
      "",
      "- {{Something this ticket won't do, and where it goes instead}}"
    )
  },
  {
    key: "open-questions",
    name: "Open questions",
    icon: "CircleQuestionMark",
    description: "Questions that block or shape the work",
    sync: false,
    content: lines(
      "## Open questions",
      "",
      "- [ ] {{A question, and who can answer it}}"
    )
  },
  {
    key: "risks",
    name: "Risks",
    icon: "TriangleAlert",
    description: "What could go wrong",
    sync: false,
    content: lines(
      "## Risks",
      "",
      "- {{What could go wrong, how likely it is, and how we'd notice}}"
    )
  },
  {
    key: "rollout-plan",
    name: "Rollout",
    icon: "Rocket",
    description: "Getting it out safely",
    sync: false,
    content: lines(
      "## Rollout",
      "",
      "- [ ] {{Flag, migration or deploy step}}",
      "- [ ] {{How we'll watch it: metric, log or dashboard}}",
      "- [ ] {{How to roll back}}"
    )
  },
  {
    key: "test-plan",
    name: "Test plan",
    icon: "FlaskConical",
    description: "How we'll know it works",
    sync: false,
    content: lines(
      "## Test plan",
      "",
      "- [ ] {{Happy path}}",
      "- [ ] {{Edge case}}",
      "- [ ] {{What must not break}}"
    )
  },
  {
    key: "designs",
    name: "Designs",
    icon: "PenTool",
    description: "Figma links, prototypes, sketches",
    sync: false,
    content: lines("## Designs", "", "- {{Paste a Figma link or prototype}}")
  },
  {
    key: "findings",
    name: "Findings",
    icon: "Microscope",
    description: "What a spike found out",
    sync: false,
    content: lines(
      "## Findings",
      "",
      "{{What you learned, with links to evidence. End with a recommendation.}}"
    )
  },
  {
    key: "notes",
    name: "Notes",
    icon: "NotebookPen",
    description: "Anything else",
    sync: false,
    content: lines("## Notes", "", "{{Anything that doesn't fit above.}}")
  }
]

const TEMPLATE_SOURCES: ReadonlyArray<TemplateSource> = [
  {
    key: "bug-report",
    name: "Bug report",
    icon: "Bug",
    description: "Something is broken",
    body: references(
      "expected-vs-actual",
      "steps-to-reproduce",
      "environment",
      "definition-of-done"
    )
  },
  {
    key: "feature",
    name: "Feature",
    icon: "Sparkles",
    description: "New behaviour users will notice",
    body: references(
      "context",
      "acceptance-criteria",
      "out-of-scope",
      "definition-of-done"
    )
  },
  {
    key: "chore",
    name: "Chore",
    icon: "Wrench",
    description: "Upkeep, upgrades and cleanup",
    body: references("context", "acceptance-criteria")
  },
  {
    key: "spike",
    name: "Spike",
    icon: "Telescope",
    description: "Answer a question before building",
    body: body(
      references("open-questions"),
      customized(
        "approach",
        lines(
          "## Approach",
          "",
          "{{How you'll find out, and the timebox (for example two days).}}"
        )
      ),
      references("findings")
    )
  },
  {
    key: "user-story",
    name: "User story",
    icon: "UserRound",
    description: "A need, told from the user's side",
    body: references(
      "user-story",
      "acceptance-criteria",
      "designs",
      "definition-of-done"
    )
  },
  {
    key: "incident",
    name: "Incident review",
    icon: "Siren",
    description: "After an outage: impact, cause, follow-ups",
    body: body(
      customized(
        "context",
        lines(
          "## Impact",
          "",
          "{{Who was affected, for how long, and how badly.}}"
        )
      ),
      customized(
        "notes",
        lines("## Timeline", "", "- {{hh:mm, what happened}}")
      ),
      customized(
        "findings",
        lines(
          "## Root cause",
          "",
          "{{The underlying cause, not just the trigger.}}"
        )
      ),
      customized(
        "acceptance-criteria",
        lines("## Follow-ups", "", "- [ ] {{An action that prevents a repeat}}")
      )
    )
  },
  {
    key: "release",
    name: "Release",
    icon: "Package",
    description: "Ship a version safely",
    body: references("test-plan", "rollout-plan", "risks")
  },
  {
    key: "design-task",
    name: "Design task",
    icon: "Palette",
    description: "Visual or UX work",
    body: references(
      "context",
      "designs",
      "open-questions",
      "acceptance-criteria"
    )
  },
  {
    key: "docs",
    name: "Documentation",
    icon: "BookText",
    description: "Write or update docs",
    body: references("context", "out-of-scope", "acceptance-criteria")
  }
]

const decodeBlockDrafts = Schema.decodeUnknownSync(Schema.Array(BlockDraft))

const decodeTemplateDrafts = Schema.decodeUnknownSync(
  Schema.Array(TemplateDraft)
)

const decodeTemplateDefaults = Schema.decodeUnknownSync(TemplateDefaults)

export const BUILTIN_BLOCKS: ReadonlyArray<BlockDraft> = decodeBlockDrafts(
  BLOCK_SOURCES.map((source) => ({ ...source, color: null }))
)

export const BUILTIN_TEMPLATES: ReadonlyArray<TemplateDraft> =
  decodeTemplateDrafts(
    TEMPLATE_SOURCES.map(({ key, name, icon, description, body }) => ({
      key,
      name,
      icon,
      color: null,
      description,
      priority: null,
      tags: [],
      body
    }))
  )

export const BUILTIN_TEMPLATE_DEFAULTS: TemplateDefaults =
  decodeTemplateDefaults({
    feat: "feature",
    bug: "bug-report",
    chore: "chore",
    other: null
  })
