export type EditorShortcutAction =
  | "toggle-playback"
  | "seek-back-1"
  | "seek-forward-1"
  | "seek-back-5"
  | "seek-forward-5"
  | "timeline-start"
  | "timeline-end"
  | "undo"
  | "redo"
  | "toggle-shortcut-help";

interface ShortcutTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  parentElement?: ShortcutTargetLike | null;
}

export interface ShortcutKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  target?: unknown;
}

const IGNORED_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "AUDIO", "VIDEO", "A"]);
const IGNORED_ROLES = new Set(["slider", "spinbutton", "combobox", "textbox", "checkbox", "radio", "switch"]);

export function isEditorShortcutTargetIgnored(target: unknown): boolean {
  let element = target as ShortcutTargetLike | null;
  while (element) {
    if (
      element.isContentEditable ||
      (element.tagName && IGNORED_TAGS.has(element.tagName.toUpperCase())) ||
      (element.getAttribute?.("contenteditable") === "true") ||
      (element.getAttribute?.("data-editor-shortcuts-ignore") === "true") ||
      IGNORED_ROLES.has(element.getAttribute?.("role") ?? "")
    ) return true;
    element = element.parentElement ?? null;
  }
  return false;
}

export function resolveEditorShortcut(event: ShortcutKeyEvent): EditorShortcutAction | null {
  if (isEditorShortcutTargetIgnored(event.target)) return null;

  const key = event.key.toLowerCase();
  const hasCommandModifier = event.ctrlKey || event.metaKey;
  if (hasCommandModifier) {
    if (event.altKey) return null;
    if (key === "z") return event.shiftKey ? "redo" : "undo";
    if (key === "y" && !event.shiftKey) return "redo";
    return null;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  if (key === "?" && !event.repeat) return "toggle-shortcut-help";
  if (key === " " || key === "spacebar") {
    return event.shiftKey || event.repeat ? null : "toggle-playback";
  }
  if (key === "arrowleft") return event.shiftKey ? "seek-back-5" : "seek-back-1";
  if (key === "arrowright") return event.shiftKey ? "seek-forward-5" : "seek-forward-1";
  if (key === "home" && !event.shiftKey) return "timeline-start";
  if (key === "end" && !event.shiftKey) return "timeline-end";
  return null;
}
