import * as Schema from "effect/Schema"

export const RecentCommands = Schema.Array(Schema.String)

const RECENT_LIMIT = 5

export const rememberCommand = (recent: ReadonlyArray<string>, id: string) =>
  [id, ...recent.filter((other) => other !== id)].slice(0, RECENT_LIMIT)

export const recentFirst = <A extends Readonly<{ id: string }>>(
  commands: ReadonlyArray<A>,
  recent: ReadonlyArray<string>
) => {
  const byId = new Map(commands.map((command) => [command.id, command]))
  const first = recent.flatMap((id) => byId.get(id) ?? [])
  const leading = new Set(first)
  return {
    recent: first,
    rest: commands.filter((command) => !leading.has(command))
  }
}
