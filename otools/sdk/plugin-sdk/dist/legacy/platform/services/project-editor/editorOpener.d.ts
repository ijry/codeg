import { ProjectEditorId, ProjectEditorOpenResult } from './types';
export declare const getProjectEditorErrorMessage: (error: unknown) => string;
export declare const openProjectInEditor: (path: string, editorId: ProjectEditorId) => Promise<ProjectEditorOpenResult>;
