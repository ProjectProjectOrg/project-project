import * as Option from "effect/Option"

const isLoopback = (host: string) =>
  host === "localhost" || host.startsWith("127.") || host === "[::1]"

export const originOf = (address: string): Option.Option<string> => {
  const trimmed = address.trim().replace(/\/+$/, "")
  if (trimmed === "") return Option.none()
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `${isLoopback(trimmed.split(/[:/]/)[0] ?? "") ? "http" : "https"}://${trimmed}`
  return URL.canParse(withScheme)
    ? Option.some(new URL(withScheme).origin)
    : Option.none()
}
