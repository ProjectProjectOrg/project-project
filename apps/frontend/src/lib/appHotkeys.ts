import { defineAppHotkeys } from "@tanstack/react-hotkeys"

import { m } from "@/paraglide/messages"

const general = m.chrome_keyboard_shortcuts_general()
const create = m.chrome_command_menu_group_create()
const ticket = m.tickets_command_group()
const view = m.chrome_command_menu_group_view()
const navigation = m.chrome_command_menu_group_navigation()
const board = m.sprints_command_group()

export const appHotkeys = defineAppHotkeys({
  "app.command-menu": {
    hotkey: "Mod+K",
    meta: { name: m.chrome_command_menu_title(), group: general }
  },
  "app.shortcuts": {
    hotkey: "?",
    meta: { name: m.chrome_keyboard_shortcuts(), group: general }
  },
  "nav.dashboard": {
    hotkey: ["G", "D"],
    meta: { name: m.chrome_command_menu_go_dashboard(), group: navigation }
  },
  "nav.backlog": {
    hotkey: ["G", "B"],
    meta: { name: m.chrome_command_menu_go_backlog(), group: navigation }
  },
  "nav.sprints": {
    hotkey: ["G", "S"],
    meta: { name: m.chrome_command_menu_go_sprints(), group: navigation }
  },
  "nav.current-sprint": {
    hotkey: ["G", "C"],
    meta: { name: m.chrome_command_menu_go_current_sprint(), group: navigation }
  },
  "nav.about": {
    hotkey: ["G", "A"],
    meta: { name: m.chrome_command_menu_go_about(), group: navigation }
  },
  "nav.projects": {
    hotkey: ["G", "P"],
    meta: { name: m.chrome_command_menu_switch_project(), group: navigation }
  },
  "nav.orgs": {
    hotkey: ["G", "O"],
    meta: { name: m.chrome_command_menu_switch_org(), group: navigation }
  },
  "nav.settings": {
    hotkey: ["G", ","],
    meta: { name: m.chrome_command_menu_go_settings(), group: navigation }
  },
  "tickets.search": {
    hotkey: "/",
    meta: { name: m.tickets_search_aria_label(), group: view }
  },
  "tickets.create-anywhere": {
    hotkey: "C",
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
  "tickets.status": {
    hotkey: "S",
    meta: { name: m.tickets_command_change_status(), group: ticket }
  },
  "tickets.assign": {
    hotkey: "A",
    meta: { name: m.tickets_command_assign(), group: ticket }
  },
  "tickets.assign-me": {
    hotkey: "I",
    meta: { name: m.tickets_command_assign_me(), group: ticket }
  },
  "tickets.priority": {
    hotkey: "P",
    meta: { name: m.tickets_command_set_priority(), group: ticket }
  },
  "tickets.tags": {
    hotkey: "T",
    meta: { name: m.tickets_command_tags(), group: ticket }
  },
  "tickets.estimate": {
    hotkey: "Shift+E",
    meta: { name: m.tickets_command_set_estimate(), group: ticket }
  },
  "tickets.sprint": {
    hotkey: "Shift+S",
    meta: { name: m.tickets_command_move_to_sprint(), group: ticket }
  },
  "tickets.parent": {
    hotkey: "Shift+P",
    meta: { name: m.tickets_shortcut_set_parent(), group: ticket }
  },
  "tickets.type": {
    hotkey: "Y",
    meta: { name: m.tickets_command_change_type(), group: ticket }
  },
  "tickets.open": {
    hotkey: "O",
    meta: { name: m.tickets_shortcut_open(), group: ticket }
  },
  "tickets.subscribe": {
    hotkey: "Shift+U",
    meta: { name: m.tickets_shortcut_subscribe(), group: ticket }
  },
  "tickets.copy-id": {
    hotkey: "Mod+.",
    meta: { name: m.tickets_command_copy_id(), group: ticket }
  },
  "tickets.copy-link": {
    hotkey: "Mod+Shift+,",
    meta: { name: m.tickets_command_copy_link(), group: ticket }
  },
  "tickets.copy-branch": {
    hotkey: "Mod+Shift+.",
    meta: { name: m.tickets_command_copy_branch(), group: ticket }
  },
  "tickets.archive": {
    hotkey: "Mod+Backspace",
    options: { ignoreInputs: true },
    meta: { name: m.tickets_command_archive(), group: ticket }
  },
  "tickets.flag": {
    hotkey: "F",
    meta: { name: m.tickets_command_flag(), group: ticket }
  },
  "tickets.edit-description": {
    hotkey: "E",
    meta: { name: m.tickets_description_edit(), group: ticket }
  },
  "tickets.next": {
    hotkey: "J",
    scope: "ticket",
    meta: { name: m.tickets_stepper_next(), group: ticket }
  },
  "tickets.previous": {
    hotkey: "K",
    scope: "ticket",
    meta: { name: m.tickets_stepper_previous(), group: ticket }
  },
  "tickets.focus-next": {
    hotkey: "J",
    scope: "ticket-list",
    meta: { name: m.tickets_shortcut_focus_next(), group: view }
  },
  "tickets.focus-previous": {
    hotkey: "K",
    scope: "ticket-list",
    meta: { name: m.tickets_shortcut_focus_previous(), group: view }
  },
  "tickets.select-all": {
    hotkey: "Mod+A",
    options: { ignoreInputs: true },
    meta: { name: m.tickets_shortcut_select_all(), group: view }
  },
  "tickets.filter": {
    hotkey: "Shift+F",
    meta: { name: m.tickets_command_filter(), group: view }
  },
  "tickets.select": {
    hotkey: "X",
    meta: { name: m.tickets_shortcut_select(), group: view }
  },
  "board.left": {
    hotkey: "H",
    scope: "board",
    meta: { name: m.sprints_shortcut_move_left(), group: board }
  },
  "board.down": {
    hotkey: "J",
    scope: "board",
    meta: { name: m.sprints_shortcut_move_down(), group: board }
  },
  "board.up": {
    hotkey: "K",
    scope: "board",
    meta: { name: m.sprints_shortcut_move_up(), group: board }
  },
  "board.right": {
    hotkey: "L",
    scope: "board",
    meta: { name: m.sprints_shortcut_move_right(), group: board }
  }
})

declare module "@tanstack/react-hotkeys" {
  interface Register {
    appHotkeys: typeof appHotkeys
  }
}
