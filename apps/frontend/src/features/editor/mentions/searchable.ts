import type {
  MentionCandidate,
  MentionProvider
} from "@pp/ui/editor/mentions/registry"
import type * as Effect from "effect/Effect"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"

import type { SearchPage } from "@/lib/searchPages"

import type { MentionSearchFailed } from "./errors"

export type MentionPage = SearchPage<MentionCandidate>

// A mention provider with the app's search behind it (paged, through the
// atom registry); the editor sees only the provider and its results.
export type SearchableMentionProvider = MentionProvider &
  Readonly<{
    search: (
      query: string,
      cursor: string | null
    ) => Effect.Effect<MentionPage, MentionSearchFailed, AtomRegistry>
  }>
