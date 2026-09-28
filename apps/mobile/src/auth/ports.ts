import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type * as Option from "effect/Option"

import type { Pkce } from "./oauth"

export class AuthBrowser extends Context.Service<
  AuthBrowser,
  Readonly<{
    authorize: (url: string) => Effect.Effect<Option.Option<string>>
  }>
>()("@pp/mobile/auth/ports/AuthBrowser") {}

export class PkceSource extends Context.Service<
  PkceSource,
  Readonly<{ create: Effect.Effect<Pkce> }>
>()("@pp/mobile/auth/ports/PkceSource") {}
