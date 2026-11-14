import type * as Exit from "effect/Exit"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useState } from "react"

import { mutationErrorText } from "@/lib/mutationError"

export function useSave<A, R, E>(
  save: (input: A) => Promise<Exit.Exit<R, E>>
): Readonly<{
  waiting: boolean
  error: string | null
  run: (input: A) => Promise<Exit.Exit<R, E>>
}> {
  const [state, setState] = useState<
    Readonly<{ waiting: boolean; error: string | null }>
  >({ waiting: false, error: null })
  const run = async (input: A) => {
    setState({ waiting: true, error: null })
    const exit = await save(input)
    setState({
      waiting: false,
      error: mutationErrorText(AsyncResult.fromExit(exit))
    })
    return exit
  }
  return { ...state, run }
}
