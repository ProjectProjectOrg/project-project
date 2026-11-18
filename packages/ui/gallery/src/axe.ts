import axe, { type Result, type RunOptions } from "axe-core"

export type RuleResult = Readonly<{
  id: string
  help: string
  helpUrl: string
  impact: string | null
  elements: number
  samples: ReadonlyArray<string>
}>

export type StandardRun = Readonly<{
  violations: ReadonlyArray<RuleResult>
  incomplete: ReadonlyArray<RuleResult>
  passes: ReadonlyArray<RuleResult>
  inapplicable: number
}>

export type AccessibilityReport = Readonly<{
  version: string
  aa: StandardRun
  aaa: StandardRun
}>

export type RuleStatus = "pass" | "fail" | "review" | "not-applicable"

const FOCUS_GUARDS = "[data-base-ui-focus-guard]"

const AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]
const AAA_TAGS = ["wcag2aaa"]

export const AA_CONTRAST_RULE = "color-contrast"
export const AAA_CONTRAST_RULE = "color-contrast-enhanced"

const toRule = (result: Result) => ({
  id: result.id,
  help: result.help,
  helpUrl: result.helpUrl,
  impact: result.impact ?? null,
  elements: result.nodes.length,
  samples: result.nodes.slice(0, 3).map((node) => {
    const detail = node.any[0]?.message ?? node.failureSummary ?? ""
    return `${node.html.slice(0, 80)} ${detail.split("\n")[0] ?? ""}`.trim()
  })
})

const overlaps = (a: DOMRect, b: DOMRect) =>
  a.width > 0 &&
  a.height > 0 &&
  a.left < b.right &&
  a.right > b.left &&
  a.top < b.bottom &&
  a.bottom > b.top

const popupsOver = (element: Element) => {
  const frame = element.getBoundingClientRect()
  return [...document.querySelectorAll("[data-base-ui-portal]")].filter(
    (portal) =>
      portal.querySelector("[data-gallery-chrome]") === null &&
      [...portal.children].some((child) =>
        overlaps(child.getBoundingClientRect(), frame)
      )
  )
}

async function runStandard(
  targets: ReadonlyArray<Element>,
  options: RunOptions
) {
  const results = await axe.run(
    { include: [...targets], exclude: [[FOCUS_GUARDS]] },
    options
  )
  return {
    violations: results.violations.map(toRule),
    incomplete: results.incomplete.map(toRule),
    passes: results.passes.map(toRule),
    inapplicable: results.inapplicable.length
  }
}

export const ruleStatus = (run: StandardRun, id: string) => {
  if (run.violations.some((rule) => rule.id === id)) return "fail"
  if (run.incomplete.some((rule) => rule.id === id)) return "review"
  if (run.passes.some((rule) => rule.id === id)) return "pass"
  return "not-applicable"
}

const SETTLE_TIMEOUT_MS = 2000

const animationsSettled = () =>
  Promise.race([
    Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished)
    ),
    new Promise((resolve) => window.setTimeout(resolve, SETTLE_TIMEOUT_MS))
  ])

let queue: Promise<unknown> = Promise.resolve()

export function checkAccessibility(element: Element) {
  const run = queue.then(async () => {
    await animationsSettled()
    const targets = [element, ...popupsOver(element)]
    const aa = await runStandard(targets, {
      runOnly: { type: "tag", values: AA_TAGS }
    })
    const aaa = await runStandard(targets, {
      runOnly: { type: "tag", values: AAA_TAGS },
      rules: { [AAA_CONTRAST_RULE]: { enabled: true } }
    })
    return { version: axe.version, aa, aaa }
  })
  queue = run.catch(() => undefined)
  return run
}
