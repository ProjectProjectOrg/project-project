import type { GuideLabels } from "@pp/ui/guide"

// The app passes its messages; the gallery spells them out.
export const LABELS: GuideLabels = {
  done: "Got it",
  next: "Next",
  back: "Back",
  skip: "Skip the guide",
  progress: (step, total) => `${step} of ${total}`
}
