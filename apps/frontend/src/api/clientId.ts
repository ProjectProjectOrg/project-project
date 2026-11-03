import * as Effect from "effect/Effect"

import { browserCrypto } from "@/lib/browserCrypto"

export const clientId: string = Effect.runSync(browserCrypto.randomUUIDv4())
