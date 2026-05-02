// packages/frontend/src/routes/index.tsx
//
// The "/" route. This is where Chapter 0's payoff lives: you will call the
// backend's /health endpoint via the shared HttpApi, fully type-checked, with
// no manual fetch and no codegen step.
//
// CHAPTER 0 STEPS
// ----------------------------------------------------------------------------
//   1. Import { createFileRoute } from "@tanstack/react-router".
//   2. Import { Effect } from "effect".
//   3. Import { ApiClientLive, ApiClient } from "../services/ApiClient".
//   4. Declare the route: `export const Route = createFileRoute("/")({ component: Home })`.
//   5. In the Home component, kick off the call inside a useEffect:
//        - Build an Effect that yields the ApiClient and calls
//          `client.health.get()`.
//        - Provide ApiClientLive.
//        - Run with Effect.runPromise and stash the result in component state.
//
// EXPECTED OUTPUT
// ----------------------------------------------------------------------------
// Render the JSON `{ status: "ok" }` on the page. Ugly is fine.
//
// WHY THIS APPROACH FEELS AWKWARD (and that is the point)
// ----------------------------------------------------------------------------
// You will notice things like:
//   - You manually call Effect.runPromise inside a useEffect.
//   - You manually provide the layer every time.
//   - There is no caching, no "in flight" tracking, no error UI.
// All of these are real problems. Chapter 1 (or wherever atoms land) will
// introduce `@effect-atom/atom-react` as the principled solution. Feeling
// the pain first makes the medicine taste better.

// TODO: imports

// TODO: createFileRoute("/") with component: Home

// TODO: function Home() { ...useState/useEffect... return <pre>{JSON.stringify(data)}</pre> }

export {}
