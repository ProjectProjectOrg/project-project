import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"

import { me } from "@/features/auth/atoms/auth"
import { rankMembers } from "@/features/editor/lib/memberRanking"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { m } from "@/paraglide/messages"

import { MentionSearchFailed } from "./errors"
import type { MentionProvider, MentionScope } from "./registry"

export const userProvider = (scope: MentionScope): MentionProvider => ({
  type: "user",
  search: (query) =>
    Effect.gen(function* () {
      const q = query.toLowerCase()
      const members = scope.members
      if (members && members.length > 0) {
        return rankMembers(members, query, scope.involved).map((member) => ({
          id: member.id,
          label: member.name,
          secondary: member.email,
          image: member.image
        }))
      }
      const viewer = yield* Atom.getResult(me())
      const label = viewer.name ?? viewer.id
      if (
        q &&
        !label.toLowerCase().includes(q) &&
        !viewer.id.toLowerCase().includes(q)
      ) {
        return []
      }
      return [{ id: viewer.id, label, image: null }]
    }).pipe(
      Effect.map((items) => ({ items, nextCursor: null })),
      Effect.mapError(() => new MentionSearchFailed())
    ),
  heading: () => m.tickets_mention_people_heading(),
  failed: () => m.tickets_mention_people_failed(),
  renderRow: (candidate) => (
    <div className="flex min-w-0 items-center gap-2">
      <MemberAvatar
        member={{
          id: candidate.id,
          name: candidate.label,
          email: candidate.secondary ?? null,
          image: candidate.image ?? null
        }}
        size={20}
      />
      <span className="truncate font-semibold">{candidate.label}</span>
      {candidate.secondary && (
        <span className="truncate text-caption text-muted-foreground">
          {candidate.secondary}
        </span>
      )}
    </div>
  )
})
