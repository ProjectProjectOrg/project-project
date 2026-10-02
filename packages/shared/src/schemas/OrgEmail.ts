import * as Schema from "effect/Schema"

const SingleLine = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(320),
  Schema.isPattern(/^[^\r\n]+$/)
)
export const EmailAddress = SingleLine.check(
  Schema.isPattern(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/)
)
export const EmailSecurity = Schema.Literals(["tls", "starttls"])
export const EmailFailureReason = Schema.Literals([
  "authentication",
  "connection",
  "host_not_allowed",
  "tls",
  "sender",
  "delivery",
  "not_configured",
  "encryption",
  "password_required",
  "settings_changed"
])
export type EmailFailureReason = typeof EmailFailureReason.Type

export const EmailSettings = Schema.Struct({
  host: SingleLine.check(Schema.isPattern(/^[a-zA-Z0-9.-]+$/)),
  port: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
  security: EmailSecurity,
  username: SingleLine,
  senderName: SingleLine,
  senderEmail: EmailAddress,
  replyTo: Schema.NullOr(EmailAddress)
})
export type EmailSettings = typeof EmailSettings.Type

export const SaveOrgEmailInput = Schema.Struct({
  ...EmailSettings.fields,
  password: Schema.optional(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096))
  )
})
export type SaveOrgEmailInput = typeof SaveOrgEmailInput.Type

export const OrgEmailStatus = Schema.Struct({
  settings: Schema.NullOr(EmailSettings),
  lastTest: Schema.NullOr(
    Schema.Struct({
      at: Schema.Date,
      error: Schema.NullOr(EmailFailureReason)
    })
  )
})
export type OrgEmailStatus = typeof OrgEmailStatus.Type

export class OrgEmailError extends Schema.TaggedError<OrgEmailError>()(
  "OrgEmailError",
  { reason: EmailFailureReason },
  { httpApiStatus: 400 }
) {}
