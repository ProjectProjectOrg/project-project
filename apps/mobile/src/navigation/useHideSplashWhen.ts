import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import { SplashScreen } from "expo-router"
import { useEffect } from "react"

const longestSplash = "1 second"

export const useHideSplashWhen = (ready: boolean) => {
  useEffect(() => {
    const fiber = Effect.runFork(
      Effect.sleep(ready ? 0 : longestSplash).pipe(
        Effect.andThen(Effect.sync(() => SplashScreen.hide()))
      )
    )
    return () => {
      Effect.runFork(Fiber.interrupt(fiber))
    }
  }, [ready])
}
