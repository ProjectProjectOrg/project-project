import * as Result from "effect/Result"
import { toASCII } from "punycode/"
import { URL } from "whatwg-url-minimum"

export type AddressProblem = "empty" | "invalid" | "insecure"

const schemePattern = /^[a-z][a-z\d+.-]*:\/\//i

const parse = (address: string) =>
  Result.try({
    try: () =>
      new URL(schemePattern.test(address) ? address : `https://${address}`),
    catch: (): AddressProblem => "invalid"
  })

const asciiHost = (hostname: string) =>
  hostname.startsWith("[")
    ? Result.succeed(hostname)
    : Result.try({
        try: () => toASCII(hostname.toLowerCase().replace(/\.$/, "")),
        catch: (): AddressProblem => "invalid"
      }).pipe(
        Result.filterOrFail(
          (host) => host.split(".").every((label) => label.length > 0),
          (): AddressProblem => "invalid"
        )
      )

export const normalizeAddress = (input: string, allowInsecure: boolean) => {
  const trimmed = input.trim()
  if (trimmed.length === 0) return Result.fail<AddressProblem>("empty")
  return Result.flatMap(parse(trimmed), (url) => {
    if (url.protocol === "http:" && !allowInsecure) {
      return Result.fail<AddressProblem>("insecure")
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return Result.fail<AddressProblem>("invalid")
    }
    if (url.username !== "" || url.password !== "") {
      return Result.fail<AddressProblem>("invalid")
    }
    const port = url.port === "" ? "" : `:${url.port}`
    return Result.map(
      asciiHost(url.hostname),
      (host) => `${url.protocol}//${host}${port}`
    )
  })
}

export const hostOf = (origin: string) => origin.replace(/^[a-z]+:\/\//i, "")
