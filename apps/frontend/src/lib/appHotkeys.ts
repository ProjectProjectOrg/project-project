import { defineAppHotkeys } from "@tanstack/react-hotkeys"

import { m } from "@/paraglide/messages"

const general = m.chrome_keyboard_shortcuts_general()
const create = m.chrome_command_menu_group_create()
const ticket = m.tickets_command_group()
const view = m.chrome_command_menu_group_view()

export const appHotkeys = defineAppHotkeys({
  "app.command-menu": {
    hotkey: "Mod+K",
    meta: { name: m.chrome_command_menu_title(), group: general }
  },
  "app.shortcuts": {
    hotkey: "?",
    meta: { name: m.chrome_keyboard_shortcuts(), group: general }
  },
  "tickets.search": {
    hotkey: "/",
    meta: { name: m.tickets_search_aria_label(), group: view }
  },
  "tickets.create": {
    hotkey: "C",
    scope: "ticket-list",
    meta: { name: m.tickets_shortcut_new_ticket(), group: create }
  },
  "tickets.add-sub-ticket": {
    hotkey: "C",
    scope: "ticket",
    meta: { name: m.tickets_command_add_sub_ticket(), group: create }
  },
  "projects.create": {
    hotkey: "C",
    scope: "projects",
    meta: { name: m.projects_shortcut_new_project(), group: create }
  },
  "tickets.edit-description": {
    hotkey: "E",
    meta: { name: m.tickets_description_edit(), group: ticket }
  },
  "tickets.next": {
    hotkey: "J",
    meta: { name: m.tickets_stepper_next(), group: ticket }
  },
  "tickets.previous": {
    hotkey: "K",
    meta: { name: m.tickets_stepper_previous(), group: ticket }
  }
})

declare module "@tanstack/react-hotkeys" {
  interface Register {
    appHotkeys: typeof appHotkeys
  }
}
