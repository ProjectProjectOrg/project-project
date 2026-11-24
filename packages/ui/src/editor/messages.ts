/*
 * The editor's strings. The app registers its own messages once, at its
 * root (provideEditorMessages(m), with its Paraglide `m`, which has every
 * key below); the gallery registers English. The editor's code reads them
 * through `m` from this module, so its call sites look like the app's.
 * Nothing has a default: reading a string before messages are provided
 * throws.
 */

export type EditorMessages = Readonly<{
  common_cancel_button: () => string
  common_key_alt: () => string
  common_key_backspace: () => string
  common_key_ctrl: () => string
  common_key_delete: () => string
  common_key_enter: () => string
  common_key_escape: () => string
  common_key_shift: () => string
  common_key_space: () => string
  common_key_tab: () => string
  common_key_win: () => string
  common_scroll_area_label: () => string
  editor_attachment_actions: () => string
  editor_attachment_collapse: () => string
  editor_attachment_download: () => string
  editor_code_language: () => string
  editor_code_language_plain: () => string
  editor_attachment_exit_fullscreen: () => string
  editor_attachment_expand: () => string
  editor_attachment_format_generic: () => string
  editor_attachment_format_gzip: () => string
  editor_attachment_format_pdf: () => string
  editor_attachment_format_tar: () => string
  editor_attachment_format_video: () => string
  editor_attachment_format_zip: () => string
  editor_attachment_fullscreen: () => string
  editor_attachment_remove: () => string
  editor_attachment_remove_confirm: () => string
  editor_attachment_removing: () => string
  editor_attachment_retry: () => string
  editor_attachment_too_large: (
    inputs: Readonly<{ limit: string | number }>
  ) => string
  editor_attachment_type_rejected: () => string
  editor_attachment_unavailable: () => string
  editor_attachment_upload_failed: () => string
  editor_attachment_uploading: () => string
  editor_attachment_view_compact: () => string
  editor_attachment_view_rich: () => string
  editor_attachment_zoom_in: () => string
  editor_attachment_zoom_out: () => string
  editor_block_announce_detached: (inputs: Readonly<{ name: string }>) => string
  editor_block_announce_duplicated: (
    inputs: Readonly<{ name: string }>
  ) => string
  editor_block_announce_edge_bottom: (
    inputs: Readonly<{ name: string }>
  ) => string
  editor_block_announce_edge_top: (inputs: Readonly<{ name: string }>) => string
  editor_block_announce_made_definition: (
    inputs: Readonly<{ name: string }>
  ) => string
  editor_block_announce_moved_above: (
    inputs: Readonly<{ name: string; target: string }>
  ) => string
  editor_block_announce_moved_below: (
    inputs: Readonly<{ name: string; target: string }>
  ) => string
  editor_block_announce_moved_down: (
    inputs: Readonly<{ name: string }>
  ) => string
  editor_block_announce_moved_up: (inputs: Readonly<{ name: string }>) => string
  editor_block_announce_removed: (inputs: Readonly<{ name: string }>) => string
  editor_block_announce_reset: (inputs: Readonly<{ name: string }>) => string
  editor_block_announce_reverted: (inputs: Readonly<{ name: string }>) => string
  editor_block_announce_unwrapped: (
    inputs: Readonly<{ name: string }>
  ) => string
  editor_block_handle_label: (inputs: Readonly<{ name: string }>) => string
  editor_block_menu_confirm_make_definition_action: () => string
  editor_block_menu_confirm_make_definition_message: () => string
  editor_block_menu_confirm_reset_action: () => string
  editor_block_menu_confirm_reset_message: () => string
  editor_block_menu_confirm_revert_action: () => string
  editor_block_menu_confirm_revert_message: () => string
  editor_block_menu_detach: () => string
  editor_block_menu_duplicate: () => string
  editor_block_menu_label: (inputs: Readonly<{ name: string }>) => string
  editor_block_menu_make_definition: () => string
  editor_block_menu_make_definition_confirm: () => string
  editor_block_menu_move_down: () => string
  editor_block_menu_move_up: () => string
  editor_block_menu_remove: () => string
  editor_block_menu_remove_wrapper: () => string
  editor_block_menu_reset: () => string
  editor_block_menu_reset_confirm: () => string
  editor_block_menu_revert_confirm: () => string
  editor_block_not_filled_in: () => string
  editor_block_origin_builtin: () => string
  editor_block_origin_org: () => string
  editor_block_origin_project: () => string
  editor_block_status_edited: () => string
  editor_block_status_matches: () => string
  editor_block_tooltip: (
    inputs: Readonly<{ name: string; origin: string }>
  ) => string
  editor_format_block: () => string
  editor_format_bold: () => string
  editor_format_code: () => string
  editor_format_italic: () => string
  editor_format_link: () => string
  editor_format_link_placeholder: () => string
  editor_format_strikethrough: () => string
  editor_format_text: () => string
  editor_format_toolbar: () => string
  editor_format_unlink: () => string
  editor_line_placeholder: () => string
  editor_paper_default_name: () => string
  editor_embed_actions: () => string
  editor_embed_remove_confirm: () => string
  editor_embed_rename: () => string
  editor_paper_edit_name: () => string
  editor_paper_name_input_label: () => string
  editor_paper_open: () => string
  editor_paper_remove: () => string
  editor_placeholder: () => string
  editor_save_failed: () => string
  editor_slash_basic_bullet_list: () => string
  editor_slash_basic_checklist: () => string
  editor_slash_basic_code: () => string
  editor_slash_basic_divider: () => string
  editor_slash_basic_heading: () => string
  editor_slash_basic_heading_1: () => string
  editor_slash_basic_heading_3: () => string
  editor_slash_basic_heading_4: () => string
  editor_slash_basic_heading_5: () => string
  editor_slash_basic_heading_6: () => string
  editor_slash_basic_hint: () => string
  editor_slash_basic_numbered_list: () => string
  editor_slash_basic_paragraph: () => string
  editor_slash_basic_quote: () => string
  editor_slash_basic_table: () => string
  editor_slash_copy_hint: () => string
  editor_slash_empty: (inputs: Readonly<{ query: string }>) => string
  editor_slash_footer_select: () => string
  editor_slash_gallery_blocks: () => string
  editor_slash_gallery_browse: () => string
  editor_slash_hint_placeholder: () => string
  editor_slash_label: () => string
  editor_slash_preview_gallery: () => string
  editor_slash_section_basic: () => string
  editor_slash_section_blocks: () => string
  editor_slash_section_suggested: () => string
  editor_slash_synced: () => string
  editor_slash_tab_all: () => string
  editor_slash_tabs_label: () => string
  editor_submit_hint: () => string
  editor_synced_customize: () => string
  editor_synced_detach: () => string
  editor_synced_edit: () => string
  editor_synced_from: (inputs: Readonly<{ origin: string }>) => string
  editor_synced_linked: () => string
  editor_synced_managed_org: () => string
  editor_synced_managed_project: () => string
  editor_synced_source_removed: () => string
  editor_template_customized: () => string
  editor_template_revert: () => string
  editor_video_exit_fullscreen: () => string
  editor_video_fullscreen: () => string
  editor_video_mute: () => string
  editor_video_pause: () => string
  editor_video_play: () => string
  editor_video_seek: () => string
  editor_video_speed: (inputs: Readonly<{ rate: string | number }>) => string
  editor_video_unmute: () => string
  editor_video_volume: () => string
  figma_chip_loading: () => string
  figma_chip_thumbnail_alt: (inputs: Readonly<{ name: string }>) => string
  figma_chip_unavailable: () => string
  figma_embed_collapse: () => string
  figma_embed_expand: () => string
  figma_embed_open_in_figma: () => string
  figma_embed_remove: () => string
  tickets_mention_list_label: () => string
  tickets_mention_tickets_empty: () => string
  tickets_mention_tickets_failed: () => string
  tickets_mention_tickets_loading: () => string
  tickets_save_status_dirty: () => string
  tickets_save_status_saved: () => string
}>

let current: EditorMessages | null = null

export function provideEditorMessages(messages: EditorMessages) {
  current = messages
}

const provided = () => {
  if (current === null)
    throw new Error(
      "Editor messages read before provideEditorMessages was called."
    )
  return current
}

// Each message resolves when it's called, so code can hold a reference to
// one (a table of labels at module level) before the app has provided them.
export const m: EditorMessages = new Proxy({} as EditorMessages, {
  get:
    (_target, key: string) =>
    (...args: ReadonlyArray<unknown>) =>
      (
        provided()[key as keyof EditorMessages] as (
          ...a: ReadonlyArray<unknown>
        ) => string
      )(...args)
})
