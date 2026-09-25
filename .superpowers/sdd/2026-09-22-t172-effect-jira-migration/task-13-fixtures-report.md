# Task 13 — fixture slice verified

The paused checkpoint supplied `BrowserFixtures.ts` and its tests. The fixture exposes deterministic Jira and OAuth responses, every manifest-v2 source category, cursor and offset pagination, per-call accounting, one rate limit, one expired refresh, and a held attachment stream. The tests exercise Jira pages through the real client and the injected transport.

After fixing the invalid Fiber polling call and fixture type errors, the five fixture tests passed alongside the 93 pure-domain tests: eight files, 98 tests total. Backend typecheck exited 0. Focused format and lint exited 0 with nonfatal lint warnings. No production runtime or public endpoint was changed.

Task 13 remains open: the local-only control endpoints, runnable backend harness, invocation of the resource guard before setup, and public browser proof have not been implemented or verified.

The resource guard was added after this fixture checkpoint. It rejects any database other than `projectproject_effect_v4_t172_browser` on loopback port 55432 and any bucket other than `projectproject-t172-local-browser` at the loopback MinIO endpoint on port 59000. Its eight rejection cases and two acceptance cases passed with the five fixture tests (14 tests total), and backend typecheck passed. The guard is pure and must be called before the later harness performs any setup; the script is not yet runnable as a server.
