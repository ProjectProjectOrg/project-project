export type RankableMember = Readonly<{
  id: string
  name: string
  email: string
  username?: string | null
}>

const normalize = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ")

const startsAnyWord = (value: string, needle: string): boolean =>
  value.split(/[\s._-]+/).some((word) => word.startsWith(needle))

const scoreOf = (member: RankableMember, needle: string): number | null => {
  if (needle === "") return 0
  const name = normalize(member.name)
  const username = normalize(member.username ?? "")
  const email = normalize(member.email)
  if (name === needle || username === needle) return 0
  if (name.startsWith(needle) || username.startsWith(needle)) return 1
  if (startsAnyWord(name, needle) || email.startsWith(needle)) return 2
  if (
    name.includes(needle) ||
    username.includes(needle) ||
    email.includes(needle)
  ) {
    return 3
  }
  return null
}

export const rankMembers = <M extends RankableMember>(
  members: ReadonlyArray<M>,
  query: string,
  involved: ReadonlyArray<string> = []
): ReadonlyArray<M> => {
  const needle = normalize(query)
  const involvedSet = new Set(involved)
  return members
    .flatMap((member, index) => {
      const score = scoreOf(member, needle)
      return score === null
        ? []
        : [{ member, index, score, involved: involvedSet.has(member.id) }]
    })
    .toSorted(
      (a, b) =>
        a.score - b.score ||
        Number(b.involved) - Number(a.involved) ||
        a.index - b.index
    )
    .map(({ member }) => member)
}
