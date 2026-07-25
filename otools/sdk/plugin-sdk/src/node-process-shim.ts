import { readNoderModule, readRuntimePlatform, runtimeWindow } from "./node-compat-core";

type ProcessLike = {
  argv: string[];
  browser?: boolean;
  cwd: () => string;
  env: Record<string, string | undefined>;
  nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => void;
  platform: string;
  release?: Record<string, unknown>;
  title?: string;
  versions: Record<string, string>;
};

function readProcess(): ProcessLike | null {
  return readNoderModule<ProcessLike>("process");
}

const fallbackProcess: ProcessLike = {
  argv: [],
  browser: true,
  cwd: () => runtimeWindow()?.__OToolsEnv?.paths?.cwd || "/",
  env: {
    NODE_ENV: runtimeWindow()?.__OToolsEnv?.isDev ? "development" : "production",
    ...(runtimeWindow()?.__OToolsEnv?.processEnv ?? {}),
  },
  nextTick(callback, ...args) {
    queueMicrotask(() => callback(...args));
  },
  platform: readRuntimePlatform(),
  release: { name: "browser" },
  title: "browser",
  versions: {
    node: "20.0.0-otools",
  },
};

const processProxy = new Proxy(fallbackProcess, {
  get(target, prop) {
    const processModule = readProcess();
    const value =
      processModule?.[prop as keyof ProcessLike] ?? target[prop as keyof ProcessLike];
    return typeof value === "function" ? value.bind(processModule ?? target) : value;
  },
  set(target, prop, value) {
    const processModule = readProcess();
    if (processModule) {
      (processModule as Record<PropertyKey, unknown>)[prop] = value;
    }
    (target as Record<PropertyKey, unknown>)[prop] = value;
    return true;
  },
});

export const argv = fallbackProcess.argv;
export const browser = true;
export const cwd = () => readProcess()?.cwd?.() ?? fallbackProcess.cwd();
export const env = fallbackProcess.env;
export const nextTick = (
  callback: (...args: unknown[]) => void,
  ...args: unknown[]
) => (readProcess()?.nextTick ?? fallbackProcess.nextTick)(callback, ...args);
export const platform = readProcess()?.platform ?? fallbackProcess.platform;
export const release = readProcess()?.release ?? fallbackProcess.release;
export const title = readProcess()?.title ?? fallbackProcess.title;
export const versions = readProcess()?.versions ?? fallbackProcess.versions;

export default processProxy;
