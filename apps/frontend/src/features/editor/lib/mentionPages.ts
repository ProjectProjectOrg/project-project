import type {
  MentionCandidate,
  MentionPage
} from "@/features/editor/mentions/registry"

export const appendMentionPage = (
  loaded: MentionPage,
  next: MentionPage
): MentionPage => {
  const seen = new Set(loaded.candidates.map((candidate) => candidate.id))
  const fresh: ReadonlyArray<MentionCandidate> = next.candidates.filter(
    (candidate) => !seen.has(candidate.id)
  )
  return {
    candidates: [...loaded.candidates, ...fresh],
    nextCursor: next.nextCursor
  }
}
