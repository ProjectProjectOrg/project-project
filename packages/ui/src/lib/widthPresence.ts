import { transitions } from "./springs"

// Something that comes and goes inside a row (a breadcrumb, a header button)
// and opens or closes its own width, so its neighbours slide instead of
// jumping. Its wrapper clips (overflow-clip with a 4px margin, so focus rings
// still show) and animates between `hidden`, `enter` and `exit`; with reduced
// motion, `fadeOnly`.

const BLUR = "blur(4px)"
const SHARP = "blur(0px)"

// It opens its width on the house curve (260ms, transitions.morph) while
// its ink fades in a beat behind (60ms in, 180ms long), so it never shows
// squeezed.
const INK_DELAY = 0.06

export const enter = {
  width: "auto",
  opacity: 1,
  filter: SHARP,
  transition: {
    width: transitions.morph,
    opacity: { ...transitions.presence, delay: INK_DELAY },
    filter: { ...transitions.presence, delay: INK_DELAY }
  }
}
// Leaving is quicker and on the house curve, not a reversed copy of the
// enter (that starts too slowly): the ink fades out at once (100ms) while the
// width closes over 180ms, so the gap is gone before the eye waits for it.
const inkOut = { ...transitions.fade, duration: 0.1 }
export const exit = {
  width: 0,
  opacity: 0,
  filter: BLUR,
  transition: {
    width: { ...transitions.morph, duration: 0.18 },
    opacity: inkOut,
    filter: inkOut
  }
}
export const hidden = { width: 0, opacity: 0, filter: BLUR }
export const fadeOnly = {
  enter: { opacity: 1, transition: transitions.fade },
  exit: { opacity: 0, transition: transitions.fade },
  hidden: { opacity: 0 }
}
