import { invoke } from '../../transport/invoke'
import type {
  ProjectScriptGroup,
  ProjectScriptInfo,
  ProjectScriptsResult,
} from './types'

const GROUP_PRIORITY = ['dev', 'build']

const compareGroupPrefix = (left: string, right: string) => {
  const leftIndex = GROUP_PRIORITY.indexOf(left)
  const rightIndex = GROUP_PRIORITY.indexOf(right)
  const leftInPriority = leftIndex !== -1
  const rightInPriority = rightIndex !== -1

  if (leftInPriority && rightInPriority) return leftIndex - rightIndex
  if (leftInPriority) return -1
  if (rightInPriority) return 1
  return left.localeCompare(right)
}

export const readProjectScripts = async (
  workingDir?: string,
): Promise<ProjectScriptsResult> => {
  return invoke<ProjectScriptsResult>('project_runner_read_scripts', {
    workingDir,
  })
}

export const groupProjectScripts = (
  scripts: ProjectScriptInfo[],
): ProjectScriptGroup[] => {
  const grouped = new Map<string, ProjectScriptInfo[]>()

  for (const script of scripts) {
    const prefix = (script.name.split(':')[0] || script.name).trim() || script.name
    const items = grouped.get(prefix) || []
    items.push(script)
    grouped.set(prefix, items)
  }

  return Array.from(grouped.entries())
    .map(([prefix, items]) => ({
      prefix,
      items: [...items].sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => compareGroupPrefix(left.prefix, right.prefix))
}

export const buildProjectScriptCommand = (
  scriptName: string,
  commandPrefix: string,
): string => `${commandPrefix || 'npm run '}${scriptName}`.trim()
