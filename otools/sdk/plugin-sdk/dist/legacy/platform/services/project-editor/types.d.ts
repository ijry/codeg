export type ProjectEditorId = 'vscode' | 'idea';
export type ProjectEditorOpenSuccessCode = 'EDITOR_OPENED';
export type ProjectEditorOpenErrorCode = 'EMPTY_PATH' | 'UNSUPPORTED_EDITOR' | 'EDITOR_OPEN_FAILED';
export interface ProjectEditorOpenResult {
    code: ProjectEditorOpenSuccessCode;
    editorId: ProjectEditorId;
    path: string;
}
export interface ProjectEditorOpenFailure extends Error {
    code: ProjectEditorOpenErrorCode;
    editorId?: ProjectEditorId;
    path?: string;
    causeMessage: string;
}
