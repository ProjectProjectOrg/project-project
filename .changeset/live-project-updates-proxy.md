---
kind: features
area: self-hosting
notice: true
---
Live project updates need an unbuffered event stream through your proxy

Open projects follow `/api/orgs/:orgSlug/projects/:slug/tickets/events`, a
server-sent event stream. The bundled nginx already serves it unbuffered.
If another proxy sits in front, honor `X-Accel-Buffering: no` or set
`proxy_buffering off` for that route, or changes made elsewhere only appear
after a reload.
