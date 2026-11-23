---
kind: improvements
area: self-hosting
notice: true
pr: 558
prs: 507, 513
---
The first start after updating rewrites ticket files

Back up your ticket files before you update. On its first start the server
gives every ticket a place in its project's manual order, turns template files
into ticket type files (`templates/` becomes `types/`, and `type: other`
becomes no type), and moves sprint membership out of the sprint files onto
each ticket. A step that fails is retried on the next start.
