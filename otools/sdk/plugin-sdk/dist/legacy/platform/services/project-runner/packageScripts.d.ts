import { ProjectScriptGroup, ProjectScriptInfo, ProjectScriptsResult } from './types';
export declare const readProjectScripts: (workingDir?: string) => Promise<ProjectScriptsResult>;
export declare const groupProjectScripts: (scripts: ProjectScriptInfo[]) => ProjectScriptGroup[];
export declare const buildProjectScriptCommand: (scriptName: string, commandPrefix: string) => string;
