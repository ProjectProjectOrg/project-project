import * as Either from "effect/Either"
import * as Schema from "effect/Schema"
import { useCallback, useState } from "react"

export function useLocalStorageState<A, I>(
  key: string,
  schema: Schema.Schema<A, I>,
  initial: A
): readonly [A, (next: A) => void] {
  const read = (): A => {
    if (typeof window === "undefined") return initial
    const raw = window.localStorage.getItem(key)
    if (raw === null) return initial
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return initial
    }
    const decoded = Schema.decodeUnknownEither(schema)(parsed)
    return Either.isRight(decoded) ? decoded.right : initial
  }

  const [value, setValue] = useState<A>(read)

  const write = useCallback(
    (next: A) => {
      setValue(next)
      if (typeof window === "undefined") return
      try {
        const encoded = Schema.encodeSync(schema)(next)
        window.localStorage.setItem(key, JSON.stringify(encoded))
      } catch {
        return
      }
    },
    [key, schema]
  )

  return [value, write] as const
}
