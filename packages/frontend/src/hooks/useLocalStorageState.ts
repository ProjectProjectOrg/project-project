import * as Either from "effect/Either"
import * as Schema from "effect/Schema"
import { useCallback, useEffect, useRef, useState } from "react"

function readFromStorage<A, I>(
  key: string,
  schema: Schema.Schema<A, I>,
  initial: A
): A {
  if (typeof window === "undefined") return initial
  let raw: string | null
  try {
    raw = window.localStorage.getItem(key)
  } catch {
    return initial
  }
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

export function useLocalStorageState<A, I>(
  key: string,
  schema: Schema.Schema<A, I>,
  initial: A
): readonly [A, (next: A) => void] {
  const schemaRef = useRef(schema)
  schemaRef.current = schema
  const initialRef = useRef(initial)
  initialRef.current = initial

  const [value, setValue] = useState<A>(() =>
    readFromStorage(key, schema, initial)
  )

  useEffect(() => {
    setValue(readFromStorage(key, schemaRef.current, initialRef.current))
  }, [key])

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
