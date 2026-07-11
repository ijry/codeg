export type ProjectRunTarget = 'builtin-terminal' | 'system-terminal'

export type ProjectRunLoadErrorCode = 'READ_SCRIPTS_FAILED'

export type ProjectRunCommandErrorCode =
  | 'EMPTY_COMMAND'
  | 'SYSTEM_TERMINAL_FAILED'
  | 'BUILTIN_TERMINAL_NOT_READY'
  | 'BUILTIN_TERMINAL_FAILED'

export type ProjectRunCommandSuccessCode =
  | 'SYSTEM_TERMINAL_OPENED'
  | 'BUILTIN_TERMINAL_EXECUTED'

export interface ProjectRunLoadError {
  code: ProjectRunLoadErrorCode
  message: string
  workingDir?: string
}

export interface ProjectScriptInfo {
  name: string
  command: string
}

export interface ProjectScriptGroup {
  prefix: string
  items: ProjectScriptInfo[]
}

export interface ProjectScriptsResult {
  hasPackageJson: boolean
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown'
  commandPrefix: string
  scripts: ProjectScriptInfo[]
}

export interface ProjectBuiltinTerminalHandle {
  runCommand: (command: string, workingDir?: string) => Promise<void> | void
}

export type ProjectRunCommandPrepareHook = () =>
  | Promise<ProjectBuiltinTerminalHandle | null>
  | ProjectBuiltinTerminalHandle
  | null

export interface ProjectRunCommandOptions {
  target: ProjectRunTarget
  command: string
  workingDir?: string
  prepareBuiltinTerminal?: ProjectRunCommandPrepareHook
}

export interface ProjectRunCommandResult {
  code: ProjectRunCommandSuccessCode
  target: ProjectRunTarget
  command: string
  workingDir?: string
}

export interface ProjectRunCommandFailure extends Error {
  code: ProjectRunCommandErrorCode
  target: ProjectRunTarget
  command: string
  workingDir?: string
  causeMessage: string
}
