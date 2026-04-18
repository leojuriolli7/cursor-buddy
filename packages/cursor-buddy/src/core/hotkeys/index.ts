export type {
  ParsedHotkey,
  HotkeyControllerOptions,
  HotkeyController,
  ModifierAlias,
  CanonicalModifier,
} from "./types"

export { parseHotkey, parseKeyboardEvent, formatHotkey } from "./parser"
export {
  matchesHotkey,
  shouldReleaseModifierOnlyHotkey,
  isModifierReleased,
} from "./matcher"
export { createHotkeyController } from "./controller"
export {
  createApprovalShortcutController,
  type ApprovalShortcutController,
  type ApprovalShortcutOptions,
} from "./approval-shortcuts"
