// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash, createHmac, randomBytes } from "node:crypto"

export const bodySignatureHeader = "x-pp-signature-256"

const secretPrefix = "whsec_"

export const signBody = (secret: string, body: string) =>
  `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`

export const signStandard = (
  secret: string,
  id: string,
  timestamp: number,
  body: string
) => {
  const key = Buffer.from(
    secret.startsWith(secretPrefix)
      ? secret.slice(secretPrefix.length)
      : secret,
    "base64"
  )
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`, "utf8")
    .digest("base64")
  return `v1,${signature}`
}

export const generateSecret = () =>
  `${secretPrefix}${randomBytes(32).toString("base64")}`

export const fingerprint = (secret: string) =>
  createHash("sha256").update(secret, "utf8").digest("hex").slice(0, 12)
