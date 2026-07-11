import { invoke } from '../../transport/invoke'
import type {
  ProjectEditorId,
  ProjectEditorOpenErrorCode,
  ProjectEditorOpenFailure,
  ProjectEditorOpenResult,
} from './types'

const SUPPORTED_EDITORS: ProjectEditorId[] = ['vscode', 'idea']

const isSupportedProjectEditor = (editorId: string): editorId is ProjectEditorId =>
  SUPPORTED_EDITORS.includes(editorId as ProjectEditorId)

const createProjectEditorError = (
  code: ProjectEditorOpenErrorCode,
  causeMessage: string,
  path?: string,
  editorId?: ProjectEditorId,
) => {
  const error = new Error(causeMessage) as ProjectEditorOpenFailure
  error.code = code
  error.path = path
  error.editorId = editorId
  error.causeMessage = causeMessage
  return error
}

export const getProjectEditorErrorMessage = (error: unknown): string => {
  if (typeof error === 'object' && error && 'causeMessage' in error) {
    return String((error as { causeMessage?: string }).causeMessage || '')
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error || '')
}

export const openProjectInEditor = async (
  path: string,
  editorId: ProjectEditorId,
): Promise<ProjectEditorOpenResult> => {
  const normalizedPath = String(path || '').trim()
  if (!normalizedPath) {
    throw createProjectEditorError('EMPTY_PATH', 'Project path is empty', normalizedPath, editorId)
  }

  const normalizedEditorId = String(editorId || '').trim()
  if (!isSupportedProjectEditor(normalizedEditorId)) {
    throw createProjectEditorError(
      'UNSUPPORTED_EDITOR',
      `Unsupported project editor: ${normalizedEditorId || 'unknown'}`,
      normalizedPath,
    )
  }

  try {
    await invoke('project_editor_open', {
      path: normalizedPath,
      editorId: normalizedEditorId,
    })
    return {
      code: 'EDITOR_OPENED',
      editorId: normalizedEditorId,
      path: normalizedPath,
    }
  } catch (error) {
    throw createProjectEditorError(
      'EDITOR_OPEN_FAILED',
      String(error),
      normalizedPath,
      normalizedEditorId,
    )
  }
}
