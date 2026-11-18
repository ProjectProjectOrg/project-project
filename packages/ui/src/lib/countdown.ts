import type { AnimationEvent, CSSProperties } from "react"

// A countdown drawn in an element's own fill: the `.countdown` class in
// theme.css paints --countdown-fill in ::before and drains it toward the
// start over `seconds`, then `onElapsed` runs. Hovering the element, or an
// ancestor marked [data-countdown-hold], holds it, and so does keyboard
// focus in either, so keyboard and screen reader users never run out of
// time. Button (`countdown` prop) and Confirm button's menu item use it.
export type Countdown = Readonly<{
  seconds: number
  onElapsed: () => void
  // Wait before draining, e.g. until an entrance has landed.
  delay?: number
}>

export function useCountdown<T extends Element>(
  countdown: Countdown | undefined,
  style?: CSSProperties,
  onAnimationEnd?: (e: AnimationEvent<T>) => void
) {
  const countdownStyle: CSSProperties | undefined =
    countdown === undefined
      ? style
      : {
          ...style,
          "--countdown": `${countdown.seconds}s`,
          "--countdown-delay": `${countdown.delay ?? 0}s`
        }
  // The drain runs on ::before, so its animationend targets the element.
  const handleAnimationEnd = (e: AnimationEvent<T>) => {
    if (e.animationName === "countdown" && e.target === e.currentTarget)
      countdown?.onElapsed()
    onAnimationEnd?.(e)
  }
  return {
    countdownClass: countdown === undefined ? undefined : "countdown",
    countdownStyle,
    handleAnimationEnd
  }
}
