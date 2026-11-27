import { createContext } from "react"

export type TicketLayout = "page" | "pane"

export const TicketLayoutContext = createContext<TicketLayout>("page")
