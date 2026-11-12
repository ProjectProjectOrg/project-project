import * as Schema from "effect/Schema"
import { expect, it } from "vitest"

import { withTicketRule, withoutTicketRule } from "./rules"
import { TicketFilterRules, TicketListQueryCompatibility } from "./Ticket"

const decode = Schema.decodeUnknownSync(TicketListQueryCompatibility)

it("preserves insertion order through edits and appends a removed rule when added again", () => {
  let rules = withTicketRule({}, { field: "blocked", operator: "is" })
  rules = withTicketRule(
    { rules },
    { field: "assignee", operator: "is", values: ["mine"] }
  )
  rules = withTicketRule({ rules }, { field: "blocked", operator: "isNot" })
  expect(rules.map((rule) => [rule.field, rule.operator])).toEqual([
    ["blocked", "isNot"],
    ["assignee", "is"]
  ])
  rules = withoutTicketRule({ rules }, "blocked")
  rules = withTicketRule({ rules }, { field: "blocked", operator: "is" })
  expect(rules.map((rule) => rule.field)).toEqual(["assignee", "blocked"])
})

it("converts legacy filter input once and rejects mixed representations", () => {
  expect(decode({ status: ["todo"], archived: false }).rules).toEqual([
    { field: "status", operator: "is", values: ["todo"] },
    { field: "archived", operator: "isNot" }
  ])
  expect(() =>
    decode({ status: ["todo"], rules: [{ field: "blocked", operator: "is" }] })
  ).toThrow()
})

it("rejects duplicate fields and duplicate selected values", () => {
  const decodeRules = Schema.decodeUnknownSync(TicketFilterRules)
  expect(() =>
    decodeRules([
      { field: "blocked", operator: "is" },
      { field: "blocked", operator: "isNot" }
    ])
  ).toThrow()
  expect(() =>
    decodeRules([{ field: "status", operator: "is", values: ["todo", "todo"] }])
  ).toThrow()
})
