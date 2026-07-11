import { ProjectRunCommandOptions, ProjectRunCommandResult } from './types';
export declare const getProjectRunErrorMessage: (error: unknown) => string;
export declare const openProjectInTerminal: (workingDir: string, command?: string) => Promise<ProjectRunCommandResult>;
export declare const runProjectCommand: (options: ProjectRunCommandOptions) => Promise<ProjectRunCommandResult>;
