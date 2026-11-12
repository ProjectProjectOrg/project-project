import { useAtomValue } from "@effect/atom-react"
import { TypeKey } from "@pp/shared"
import * as Schema from "effect/Schema"

import { currentUserId } from "@/features/auth/atoms/auth"
import {
  createLocalStorageCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"

const lastUsedCodec = createLocalStorageCodec(Schema.NullOr(TypeKey))

export const lastUsedTypeKey = (
  viewerId: string,
  orgSlug: string,
  slug: string
): string => `projectproject:last-type:${viewerId}:${orgSlug}/${slug}`

export function useLastUsedType(orgSlug: string, slug: string) {
  const viewerId = useAtomValue(currentUserId)
  return useLocalStorageState(
    lastUsedTypeKey(viewerId ?? "", orgSlug, slug),
    lastUsedCodec,
    null
  )
}
