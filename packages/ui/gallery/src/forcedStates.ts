const PSEUDO_CLASSES: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?<!\\):hover/g, '[data-force~="hover"]'],
  [/(?<!\\):active/g, '[data-force~="active"]'],
  [/(?<!\\):focus-visible/g, '[data-force~="focus"]']
]

const seen = new WeakSet<CSSRule>()

const forced = (text: string) =>
  PSEUDO_CLASSES.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    text
  )

function mirrorRules(parent: CSSStyleSheet | CSSGroupingRule) {
  for (let index = parent.cssRules.length - 1; index >= 0; index--) {
    const rule = parent.cssRules[index]
    if (rule === undefined || seen.has(rule)) continue
    seen.add(rule)
    if (rule instanceof CSSStyleRule) {
      const text = forced(rule.cssText)
      if (text !== rule.cssText) {
        parent.insertRule(text, index + 1)
        const inserted = parent.cssRules[index + 1]
        if (inserted !== undefined) seen.add(inserted)
        continue
      }
    }
    if (rule instanceof CSSGroupingRule) mirrorRules(rule)
  }
}

function mirrorAll() {
  for (const sheet of document.styleSheets) {
    try {
      mirrorRules(sheet)
    } catch {
      continue
    }
  }
}

export function mirrorForcedStates() {
  mirrorAll()
  new MutationObserver(mirrorAll).observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true
  })
}
