import { muted, strong, type Terminal } from "./terminal"

const COMMANDS = [
  ["pp overview", "Your project at a glance"],
  ["pp tickets list", "Tickets in your project"],
  ["pp use", "Pick your org and project"],
  ["pp guide", "How agents should use pp"],
  ["pp --help", "Every command"]
] as const

export const welcomeLines = (
  version: string,
  signedIn: Readonly<{ origin: string; user: string }> | undefined,
  terminal: Terminal
) => {
  const commands =
    signedIn === undefined
      ? [["pp login <server>", "Sign in"] as const, ...COMMANDS]
      : COMMANDS
  const width = Math.max(...commands.map(([command]) => command.length))
  return [
    `${strong("ProjectProject", terminal)}  ${muted(`pp ${version}`, terminal)}`,
    signedIn === undefined
      ? muted("Not signed in yet.", terminal)
      : muted(`${signedIn.user} on ${signedIn.origin}`, terminal),
    "",
    ...commands.map(
      ([command, description]) =>
        `${command.padEnd(width)}  ${muted(description, terminal)}`
    )
  ]
}
