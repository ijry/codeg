import { hostInvoke as c } from "../../transport/hostBridge.js";
const s = ["vscode", "idea"], d = (t) => s.includes(t), i = (t, n, o, r) => {
  const e = new Error(n);
  return e.code = t, e.path = o, e.editorId = r, e.causeMessage = n, e;
}, E = (t) => typeof t == "object" && t && "causeMessage" in t ? String(t.causeMessage || "") : t instanceof Error ? t.message : String(t || ""), p = async (t, n) => {
  const o = String(t || "").trim();
  if (!o)
    throw i("EMPTY_PATH", "Project path is empty", o, n);
  const r = String(n || "").trim();
  if (!d(r))
    throw i(
      "UNSUPPORTED_EDITOR",
      `Unsupported project editor: ${r || "unknown"}`,
      o
    );
  try {
    return await c("project_editor_open", {
      path: o,
      editorId: r
    }), {
      code: "EDITOR_OPENED",
      editorId: r,
      path: o
    };
  } catch (e) {
    throw i(
      "EDITOR_OPEN_FAILED",
      String(e),
      o,
      r
    );
  }
};
export {
  E as getProjectEditorErrorMessage,
  p as openProjectInEditor
};
//# sourceMappingURL=editorOpener.js.map
