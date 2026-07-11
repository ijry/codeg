import { homeHostDir, joinHostPath } from "./hostFs";

export const homeDir = async (): Promise<string> => homeHostDir();

export const join = async (...paths: string[]): Promise<string> =>
  joinHostPath(...paths);
