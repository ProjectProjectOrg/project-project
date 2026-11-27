import { transitions } from "../../lib/springs"

export const collapseDuration = transitions.pop.duration

export const figmaDisplayFade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { ...transitions.fade, duration: 0.1 } },
  collapse: {
    height: 0,
    marginTop: 0,
    marginBottom: 0,
    opacity: 0,
    overflow: "clip",
    transition: {
      duration: collapseDuration,
      ease: [0.42, 0, 0.58, 1] as const,
      opacity: { ...transitions.fade, duration: 0.12 }
    }
  },
  exit: { opacity: 0, transition: { ...transitions.fade, duration: 0.07 } }
}
