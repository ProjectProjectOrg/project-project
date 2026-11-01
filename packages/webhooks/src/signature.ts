// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash, createHmac, randomBytes } from "node:crypto"

export const signatureHeader = "x-pp-signature-256"

export const sign = (secret: string, body: string) =>
  `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`

export const generateSecret = () =>
  `whsec_${randomBytes(32).toString("base64url")}`

export const fingerprint = (secret: string) =>
  createHash("sha256").update(secret, "utf8").digest("hex").slice(0, 12)
