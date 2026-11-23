import { RegistryContext } from "@effect/atom-react"
import { provideEditorMessages } from "@pp/ui/editor/messages"
import { HotkeysProvider } from "@tanstack/react-hotkeys"
import {
  createBrowserHistory,
  createRouter,
  RouterProvider
} from "@tanstack/react-router"
import { StrictMode, useSyncExternalStore } from "react"
import ReactDOM from "react-dom/client"

import { m } from "@/paraglide/messages"

import { createSessionCache } from "./features/auth/lib/sessionCache"
import { appHotkeys } from "./lib/appHotkeys"
import { parseSearch, stringifySearch } from "./lib/searchParams"
import { routeTree } from "./routeTree.gen"
import { authClient } from "./services/AuthClient"

import "./styles.css"

// The editor (@pp/ui/editor) reads its strings from the app's messages.
provideEditorMessages(m)

const history = createBrowserHistory()
const sessions = createSessionCache((registry) =>
  createRouter({
    routeTree,
    history,
    parseSearch,
    stringifySearch,
    defaultPreload: "intent",
    scrollRestoration: true,
    scrollToTopSelectors: ["[data-scroll-root]"],
    context: { registry }
  })
)

authClient.$store.atoms.$sessionSignal.listen(sessions.refreshIdentity)
window.addEventListener("focus", sessions.refreshIdentity)

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
    ticketTitle?: string
  }
}

const rootEl = document.getElementById("root")
if (!rootEl) throw new Error("Root element #root not found")

ReactDOM.createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
)
