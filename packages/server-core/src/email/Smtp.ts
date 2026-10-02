import { lookup } from "node:dns/promises"

import { OrgEmailError, type EmailSettings } from "@pp/shared"
import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as IpNetwork from "effect/unstable/net/IpNetwork"
import * as NetAddress from "effect/unstable/net/NetAddress"
import { createTransport } from "nodemailer"

export type SmtpConnection = Readonly<{
  settings: EmailSettings
  password: Redacted.Redacted
}>

const nonPublicNetworks = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
  "::/128",
  "::1/128",
  "64:ff9b::/96",
  "100::/64",
  "2001:db8::/32",
  "fc00::/7",
  "fe80::/10",
  "ff00::/8"
].map(IpNetwork.fromStringUnsafe)

const isPublic = (address: string) =>
  Result.match(NetAddress.ipFromString(address), {
    onFailure: () => false,
    onSuccess: (ip) =>
      !nonPublicNetworks.some(IpNetwork.contains(NetAddress.toCanonical(ip)))
  })

export const publicAddress = (addresses: ReadonlyArray<string>) =>
  addresses.every(isPublic) ? Arr.head(addresses) : Option.none()

export const transportOptions = (
  { settings, password }: SmtpConnection,
  address: string
) => ({
  host: address,
  servername: settings.host,
  port: settings.port,
  secure: settings.security === "tls",
  requireTLS: settings.security === "starttls",
  auth: { user: settings.username, pass: Redacted.value(password) },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
  disableFileAccess: true,
  disableUrlAccess: true
})

const SmtpFailure = Schema.Struct({
  code: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  library: Schema.optional(Schema.String)
})
const decodeSmtpFailure = Schema.decodeUnknownOption(SmtpFailure)

// Nodemailer reports TLS handshake failures as ESOCKET.
const isTlsFailure = ({ library, message = "" }: typeof SmtpFailure.Type) =>
  library === "SSL routines" || /certificate|\bssl\b|\btls\b/i.test(message)

export const smtpError = (cause: unknown) => {
  const failure = Option.getOrUndefined(decodeSmtpFailure(cause))
  switch (failure?.code) {
    case "EAUTH":
    case "ENOAUTH":
      return new OrgEmailError({ reason: "authentication" })
    case "ESOCKET":
      return new OrgEmailError({
        reason: isTlsFailure(failure) ? "tls" : "connection"
      })
    case "ECONNECTION":
    case "ETIMEDOUT":
    case "EDNS":
    case "EPROTOCOL":
      return new OrgEmailError({ reason: "connection" })
    case "ETLS":
    case "EREQUIRETLS":
      return new OrgEmailError({ reason: "tls" })
    case "EENVELOPE":
      return new OrgEmailError({ reason: "sender" })
    default:
      return new OrgEmailError({ reason: "delivery" })
  }
}

export class Smtp extends Context.Service<
  Smtp,
  Readonly<{
    sendTest: (
      connection: SmtpConnection,
      recipient: string
    ) => Effect.Effect<void, OrgEmailError>
  }>
>()("@pp/server-core/email/Smtp") {
  static readonly layer = Layer.succeed(
    Smtp,
    Smtp.of({
      sendTest: Effect.fn("Smtp.sendTest")(function* (connection, recipient) {
        const addresses = yield* Effect.tryPromise({
          try: () =>
            lookup(connection.settings.host, { all: true, verbatim: true }),
          catch: () => new OrgEmailError({ reason: "connection" })
        })
        const address = yield* Effect.fromOption(
          publicAddress(addresses.map(({ address }) => address))
        ).pipe(
          Effect.mapError(
            () => new OrgEmailError({ reason: "host_not_allowed" })
          )
        )
        const transporter = yield* Effect.acquireRelease(
          Effect.sync(() =>
            createTransport(transportOptions(connection, address))
          ),
          (transport) => Effect.sync(() => transport.close())
        )
        const { settings } = connection
        yield* Effect.tryPromise({
          try: () =>
            transporter.sendMail({
              from: {
                name: settings.senderName,
                address: settings.senderEmail
              },
              to: recipient,
              replyTo: settings.replyTo ?? undefined,
              subject: "ProjectProject email connection test",
              text: "Your organization's outgoing email connection is working. This is a test message from ProjectProject."
            }),
          catch: smtpError
        })
      }, Effect.scoped)
    })
  )
}
