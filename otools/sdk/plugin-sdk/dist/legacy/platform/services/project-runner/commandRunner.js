import { hostInvoke as m } from "../../transport/hostBridge.js";
const a = (r, t, e, i, c) => {
  const n = new Error(c);
  return n.code = r, n.target = t, n.command = e, n.workingDir = i, n.causeMessage = c, n;
}, o = (r) => typeof r == "object" && r && "causeMessage" in r ? String(r.causeMessage || "") : r instanceof Error ? r.message : String(r || ""), g = async (r, t = "") => {
  try {
    return await m("project_runner_open_in_terminal", {
      workingDir: r
    }), {
      code: "SYSTEM_TERMINAL_OPENED",
      target: "system-terminal",
      command: t,
      workingDir: r
    };
  } catch (e) {
    throw a(
      "SYSTEM_TERMINAL_FAILED",
      "system-terminal",
      t,
      r,
      String(e)
    );
  }
}, s = async (r) => {
  const t = String(r.command || "").trim();
  if (!t)
    throw a(
      "EMPTY_COMMAND",
      r.target,
      t,
      r.workingDir,
      "Project command is empty"
    );
  if (r.target === "system-terminal")
    return g(r.workingDir || "", t);
  const e = await r.prepareBuiltinTerminal?.();
  if (!e?.runCommand)
    throw a(
      "BUILTIN_TERMINAL_NOT_READY",
      r.target,
      t,
      r.workingDir,
      "Builtin terminal is not ready"
    );
  try {
    return await e.runCommand(t, r.workingDir), {
      code: "BUILTIN_TERMINAL_EXECUTED",
      target: r.target,
      command: t,
      workingDir: r.workingDir
    };
  } catch (i) {
    throw a(
      "BUILTIN_TERMINAL_FAILED",
      r.target,
      t,
      r.workingDir,
      String(i)
    );
  }
};
export {
  o as getProjectRunErrorMessage,
  g as openProjectInTerminal,
  s as runProjectCommand
};
//# sourceMappingURL=commandRunner.js.map
