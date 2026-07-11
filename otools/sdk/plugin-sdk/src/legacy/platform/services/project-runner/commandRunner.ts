import { invoke } from '../../transport/invoke'
import type {
  ProjectRunCommandFailure,
  ProjectRunCommandErrorCode,
  ProjectRunCommandOptions,
  ProjectRunCommandResult,
  ProjectRunTarget,
} from './types'

const createRunnerError = (
  code: ProjectRunCommandErrorCode,
  target: ProjectRunTarget,
  command: string,
  workingDir: string | undefined,
  causeMessage: string,
) => {
  const error = new Error(causeMessage) as ProjectRunCommandFailure
  error.code = code
  error.target = target
  error.command = command
  error.workingDir = workingDir
  error.causeMessage = causeMessage
  return error
}

export const getProjectRunErrorMessage = (error: unknown): string => {
  if (typeof error === 'object' && error && 'causeMessage' in error) {
    return String((error as { causeMessage?: string }).causeMessage || '')
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error || '')
}

export const openProjectInTerminal = async (
  workingDir: string,
  command = '',
): Promise<ProjectRunCommandResult> => {
  try {
    await invoke('project_runner_open_in_terminal', {
      workingDir,
    })
    return {
      code: 'SYSTEM_TERMINAL_OPENED',
      target: 'system-terminal',
      command,
      workingDir,
    }
  } catch (error) {
    throw createRunnerError(
      'SYSTEM_TERMINAL_FAILED',
      'system-terminal',
      command,
      workingDir,
      String(error),
    )
  }
}

export const runProjectCommand = async (
  options: ProjectRunCommandOptions,
): Promise<ProjectRunCommandResult> => {
  const command = String(options.command || '').trim()
  if (!command) {
    throw createRunnerError(
      'EMPTY_COMMAND',
      options.target,
      command,
      options.workingDir,
      'Project command is empty',
    )
  }

  if (options.target === 'system-terminal') {
    return openProjectInTerminal(options.workingDir || '', command)
  }

  const terminal = await options.prepareBuiltinTerminal?.()
  if (!terminal?.runCommand) {
    throw createRunnerError(
      'BUILTIN_TERMINAL_NOT_READY',
      options.target,
      command,
      options.workingDir,
      'Builtin terminal is not ready',
    )
  }

  try {
    await terminal.runCommand(command, options.workingDir)
    return {
      code: 'BUILTIN_TERMINAL_EXECUTED',
      target: options.target,
      command,
      workingDir: options.workingDir,
    }
  } catch (error) {
    throw createRunnerError(
      'BUILTIN_TERMINAL_FAILED',
      options.target,
      command,
      options.workingDir,
      String(error),
    )
  }
}
