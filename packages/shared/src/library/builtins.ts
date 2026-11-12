import * as Schema from "effect/Schema"

import { EPIC_TYPE } from "../tickets/hierarchy"
import { type BlockDraft, type BlockIcon, TypeDraft } from "./Library"
import type { TypeKey } from "./LibraryKey"
import { blockDraftsFrom, type BlockSource, lines, references } from "./sources"

type TypeSource = Readonly<{
  key: string
  name: string
  icon: BlockIcon
  color: string
  description: string
  body: string
}>

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
  }
]

const TYPE_SOURCES: ReadonlyArray<TypeSource> = [
  {
    key: "feat",
    name: "Feature",
    icon: "Sparkles",
    color: "#70b445",
    description: "New behaviour users will notice",
    body: references(
      "context",
      "acceptance-criteria",
      "out-of-scope",
      "definition-of-done"
    )
  },
  {
    key: "bug",
    name: "Bug",
    icon: "Bug",
    color: "#f16f7e",
    description: "Something is broken",
    body: references(
      "expected-vs-actual",
      "steps-to-reproduce",
      "environment",
      "definition-of-done"
    )
  },
  {
    key: "chore",
    name: "Chore",
    icon: "Hammer",
    color: "#d78d00",
    description: "Upkeep, upgrades and cleanup",
    body: references("context", "acceptance-criteria")
  },
  {
    key: EPIC_TYPE,
    name: "Epic",
    icon: "Layers",
    color: "#53a0ff",
    description: "A goal that holds tickets",
    body: references("context", "out-of-scope")
  }
]

const decodeTypeDrafts = Schema.decodeUnknownSync(Schema.Array(TypeDraft))

export const BUILTIN_BLOCKS: ReadonlyArray<BlockDraft> =
  blockDraftsFrom(BLOCK_SOURCES)

export const BUILTIN_TYPES: ReadonlyArray<TypeDraft> = decodeTypeDrafts(
  TYPE_SOURCES.map((source) => ({ ...source, priority: null, tags: [] }))
)

export const BUILTIN_TYPE_KEYS: ReadonlyArray<TypeKey> = BUILTIN_TYPES.map(
  (type) => type.key
)

export const isBuiltinTypeKey = (key: string): boolean =>
  BUILTIN_TYPE_KEYS.some((builtin) => builtin === key)

export const builtinType = (key: string): TypeDraft | undefined =>
  BUILTIN_TYPES.find((type) => type.key === key)
