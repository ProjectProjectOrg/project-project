import * as Schema from "effect/Schema"

import { formatTicketBlock } from "../tickets/blocks"
import { BUILTIN_BLOCKS } from "./builtins"
import { type BlockDraft, type BlockIcon, TypeDraft } from "./Library"
import { blockDraftsFrom, type BlockSource, lines, references } from "./sources"

type TypeSource = Readonly<{
  key: string
  name: string
  icon: BlockIcon
  description: string
  body: string
}>

const customized = (key: string, content: string): string =>
  formatTicketBlock(key, content)

const body = (...parts: ReadonlyArray<string>): string => parts.join("\n\n")

const BLOCK_SOURCES: ReadonlyArray<BlockSource> = [
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

const TYPE_SOURCES: ReadonlyArray<TypeSource> = [
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

const decodeTypeDrafts = Schema.decodeUnknownSync(Schema.Array(TypeDraft))

export const GALLERY_BLOCKS: ReadonlyArray<BlockDraft> = [
  ...BUILTIN_BLOCKS,
  ...blockDraftsFrom(BLOCK_SOURCES)
]

export const GALLERY_TYPES: ReadonlyArray<TypeDraft> = decodeTypeDrafts(
  TYPE_SOURCES.map(({ key, name, icon, description, body }) => ({
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
