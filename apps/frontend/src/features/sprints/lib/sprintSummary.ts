// Sprint names read as one when they share their start: "Sprint 24, 25"
// for "Sprint 24" and "Sprint 25". Otherwise they're listed as they are.
export function sprintSummary(names: ReadonlyArray<string>) {
  const [first, ...rest] = names
  if (first === undefined) return ""
  if (rest.length === 0) return first
  const prefix = first.split(" ").slice(0, -1).join(" ")
  const shared =
    prefix !== "" && rest.every((name) => name.startsWith(`${prefix} `))
  return shared
    ? `${prefix} ${names.map((name) => name.slice(prefix.length + 1)).join(", ")}`
    : names.join(", ")
}
