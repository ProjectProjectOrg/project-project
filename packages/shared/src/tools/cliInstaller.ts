const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`

export const runInstaller = (
  url: string,
  env: Readonly<Record<string, string>>
) => {
  const assignments = Object.entries(env)
    .map(([name, value]) => `${name}=${quote(value)}`)
    .join(" ")
  return [
    `if ! installer="$(curl -fsSL ${quote(url)})"; then`,
    `  echo "pp install: couldn't download the installer from "${quote(url)}"." >&2`,
    `  echo "pp install: if this server or release is new, pp may not be published for it yet." >&2`,
    "  exit 1",
    "fi",
    `printf '%s\\n' "$installer" | ${assignments === "" ? "" : `${assignments} `}sh`
  ].join("\n")
}
