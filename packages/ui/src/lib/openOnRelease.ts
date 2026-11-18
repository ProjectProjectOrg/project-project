// Base UI's Menu and Select triggers open on mouse-down, so a press can drag
// straight onto an item. We open on release instead, like the Popover, so
// every popup trigger feels the same: the button presses, then the popup
// appears when you let go.
//
// Blocking Base UI's pointer-down and mouse-down handlers leaves its click
// hook without a pointer type, and that hook then opens (and toggles) the
// popup on click. Keyboard opening is unchanged. Merge these before the
// caller's props (`mergeProps(openOnReleaseProps, props)`), so the caller's
// own handlers still run.

type PreventableEvent = Readonly<{
  button: number
  preventBaseUIHandler: () => void
}>

const skipBaseUIPress = (event: PreventableEvent) => {
  if (event.button === 0) event.preventBaseUIHandler()
}

export const openOnReleaseProps = {
  onPointerDown: skipBaseUIPress,
  onMouseDown: skipBaseUIPress
}
