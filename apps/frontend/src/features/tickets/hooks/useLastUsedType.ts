import { useAtomValue } from "@effect/atom-react"
import { TypeKey } from "@pp/shared"
import * as Schema from "effect/Schema"
import { useCallback } from "react"

import { currentUserId } from "@/features/auth/atoms/auth"
import {
  createLocalStorageCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"

const LastUsedType = Schema.NullOr(
  Schema.Struct({ type: Schema.NullOr(TypeKey) })
)

const lastUsedCodec = createLocalStorageCodec(LastUsedType)

export const lastUsedTypeKey = (
  viewerId: string,
  orgSlug: string,
  slug: string
): string => `projectproject:last-type:${viewerId}:${orgSlug}/${slug}`

export function useLastUsedType(
  orgSlug: string,
  slug: string
): readonly [TypeKey | null | undefined, (type: TypeKey | null) => void] {
  const viewerId = useAtomValue(currentUserId)
  const [stored, store] = useLocalStorageState(
    lastUsedTypeKey(viewerId ?? "", orgSlug, slug),
    lastUsedCodec,
    null
  )
  const remember = useCallback(
    (type: TypeKey | null) => store({ type }),
    [store]
  )
  return [stored === null ? undefined : stored.type, remember]
}
