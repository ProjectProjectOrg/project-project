import * as Effect from "effect/Effect"
import * as Atom from "effect/unstable/reactivity/Atom"
import { me } from "@/atoms/auth"
import { MemberAvatar } from "@/components/MemberAvatar"
import type { MentionProvider, MentionScope } from "./registry"

export const userProvider = (scope: MentionScope): MentionProvider => ({
  trigger: "@",
  type: "user",
  search: (query) =>
    Effect.gen(function* () {
      const q = query.toLowerCase()
      const members = scope.members
      if (members && members.length > 0) {
        const filtered = members.filter((member) => {
          if (!q) return true
          return (
            member.name.toLowerCase().includes(q) ||
            member.email.toLowerCase().includes(q) ||
            (member.username?.toLowerCase().includes(q) ?? false)
          )
        })
        return filtered.map((member) => ({
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
    }).pipe(Effect.orElseSucceed(() => [])),
  renderRow: (candidate) => (
    <div className="flex min-w-0 items-center gap-2">
      <MemberAvatar
        member={{
          name: candidate.label,
          email: candidate.secondary ?? null,
          image: candidate.image ?? null
        }}
        size={20}
      />
      <span className="truncate font-medium">{candidate.label}</span>
      {candidate.secondary && (
        <span className="text-muted-foreground truncate text-xs">
          {candidate.secondary}
        </span>
      )}
    </div>
  )
})
