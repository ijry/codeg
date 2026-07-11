export { emit, listen, once, type Event, type UnlistenFn } from "./runtime";

export const TauriEvent = {
  DRAG_ENTER: "tauri://drag-enter",
  DRAG_OVER: "tauri://drag-over",
  DRAG_DROP: "tauri://drag-drop",
  DRAG_LEAVE: "tauri://drag-leave",
} as const;
