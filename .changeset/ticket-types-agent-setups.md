---
kind: features
area: agents
notice: true
pr: 513
---
Agent setups and scripts that use ticket templates need updating

`template` on `create_ticket` and `update_ticket` is gone, and so is
`list_templates`: call `list_types` and pass a type's `key` as `type`, or
`null` for a ticket without a type. In the command line, `pp templates list`
is now `pp types list` and `--template` is removed.
