import * as Schema from "effect/Schema"

import {
  createLocalStorageStringCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"

const SEEN_KEY = "projectproject:whats-new-seen"
const seenCodec = createLocalStorageStringCodec(Schema.String)

export function useWhatsNewSeen() {
  const [lastSeen, setLastSeen] = useLocalStorageState(SEEN_KEY, seenCodec, "")
  return {
    lastSeen: lastSeen === "" ? null : lastSeen,
    markSeen: setLastSeen
  }
}
