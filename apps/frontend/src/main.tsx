import { RegistryContext } from "@effect/atom-react"
import { STATE_COLORS } from "@pp/shared"
import { HotkeysProvider } from "@tanstack/react-hotkeys"
import {
  createBrowserHistory,
  createRouter,
  RouterProvider
} from "@tanstack/react-router"
import { StrictMode, useSyncExternalStore } from "react"
import ReactDOM from "react-dom/client"

import { saveBoot } from "./api/bootCache"
import { createSessionCache } from "./features/auth/lib/sessionCache"
import { localRuntime } from "./features/local/atoms/localProject"
import { appHotkeys } from "./lib/appHotkeys"
import { parseSearch, stringifySearch } from "./lib/searchParams"
import { routeTree } from "./routeTree.gen"
import { authClient } from "./services/AuthClient"

import "./styles.css"

const stateColorStyle = document.createElement("style")
const lightStateVars = Object.entries(STATE_COLORS)
  .map(([name, c]) => `--state-${name}:${c.light.oklch};`)
  .join("")
const darkStateVars = Object.entries(STATE_COLORS)
  .map(([name, c]) => `--state-${name}:${c.dark.oklch};`)
  .join("")
stateColorStyle.textContent = `:root{${lightStateVars}}.dark{${darkStateVars}}`
document.head.appendChild(stateColorStyle)

const history = createBrowserHistory()
const sessions = createSessionCache((registry) => {
  registry.mount(localRuntime)
  return createRouter({
    routeTree,
    history,
    parseSearch,
    stringifySearch,
    defaultPreload: "intent",
    scrollRestoration: true,
    scrollToTopSelectors: ["[data-scroll-root]"],
    context: { registry }
  })
})

authClient.$store.atoms.$sessionSignal.listen(sessions.refreshIdentity)
window.addEventListener("focus", sessions.refreshIdentity)
window.addEventListener("pagehide", saveBoot)

function App() {
  const session = useSyncExternalStore(sessions.subscribe, sessions.getSnapshot)
  if (!session.ready) return null
  return (
    <RegistryContext.Provider key={session.generation} value={session.registry}>
      <HotkeysProvider
        appHotkeys={appHotkeys}
        defaultOptions={{ hotkey: { ignoreDefaultPrevented: true } }}
      >
        <RouterProvider router={session.router} />
      </HotkeysProvider>
    </RegistryContext.Provider>
  )
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof sessions.getSnapshot>["router"]
  }
  interface HistoryState {
    ticketStep?: true
  }
}

const rootEl = document.getElementById("root")
if (!rootEl) throw new Error("Root element #root not found")

ReactDOM.createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
)
